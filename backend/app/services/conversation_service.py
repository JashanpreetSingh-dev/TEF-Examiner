import os
import base64
import io
from openai import OpenAI
from typing import Dict
from fastapi import WebSocket

from app.services.exam_service import ExamService


class ConversationService:
    def __init__(self):
        self.openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.exam_service = ExamService()
        self.active_sessions: Dict[str, Dict] = {}

    async def initialize_session(self, websocket: WebSocket, session_id: str):
        """Initialize a conversation session"""
        session = self.exam_service.get_session(session_id)
        if not session:
            await websocket.send_json({"type": "error", "message": "Session not found"})
            return

        # Get topic for conversation context
        topic = self.exam_service.get_topic(session.section, session.topic_id)

        # Store session info
        self.active_sessions[session_id] = {
            "websocket": websocket,
            "section": session.section,
            "topic": topic,
            "conversation_history": [],
        }

        # Send initialization message
        await websocket.send_json(
            {"type": "session_initialized", "section": session.section, "topic": topic}
        )

    async def handle_audio_chunk(
        self, websocket: WebSocket, session_id: str, audio_data: str
    ):
        """Handle incoming audio chunk from client"""
        session_info = self.active_sessions.get(session_id)
        if not session_info:
            return

        if not audio_data:
            return

        try:
            # Decode base64 webm audio sent from the browser
            audio_bytes = base64.b64decode(audio_data)

            # Wrap in a file-like object for Whisper / transcription API
            audio_file = io.BytesIO(audio_bytes)
            audio_file.name = "audio.webm"

            # Transcribe the user's speech
            transcription = self.openai_client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                # You can force language if you want: language="fr"
            )

            user_text = transcription.text.strip()
            if not user_text:
                return

            # Send the user's transcript back to the client
            await websocket.send_json(
                {"type": "transcript", "text": user_text, "speaker": "user"}
            )

            # Add to conversation history
            session_info["conversation_history"].append(
                {"speaker": "user", "text": user_text, "timestamp": None}
            )

            # Generate AI response (text) based on the updated history / section
            response = await self._generate_response(session_info, user_text)

            # Send AI transcript back to client
            await websocket.send_json(
                {
                    "type": "transcript",
                    "text": response["text"],
                    "speaker": "ai",
                }
            )

            # TODO: Optionally, add TTS here and send back `audio_chunk` events
            # so the frontend can play the AI's voice, for a full "phone call" effect.

        except Exception as e:
            # Surface errors to the client so the UI can react
            await websocket.send_json(
                {"type": "error", "message": f"Audio handling error: {e}"}
            )

    async def handle_text_input(self, websocket: WebSocket, session_id: str, text: str):
        """Handle text input (fallback if audio fails)"""
        session_info = self.active_sessions.get(session_id)
        if not session_info:
            return

        # Echo user's text as a transcript event so the UI shows it
        await websocket.send_json(
            {"type": "transcript", "text": text, "speaker": "user"}
        )

        # Add to conversation history
        session_info["conversation_history"].append(
            {"speaker": "user", "text": text, "timestamp": None}
        )

        # Generate AI response based on section
        response = await self._generate_response(session_info, text)

        # Send AI transcript back in the same format the frontend expects
        await websocket.send_json(
            {
                "type": "transcript",
                "text": response["text"],
                "speaker": "ai",
            }
        )

    async def handle_time_expired(self, websocket: WebSocket, session_id: str):
        """Handle time expiration"""
        session_info = self.active_sessions.get(session_id)
        if not session_info:
            return

        # Send time expiration message
        await websocket.send_json(
            {"type": "time_expired", "message": "Merci, le temps est écoulé."}
        )

    async def _generate_response(self, session_info: Dict, user_text: str) -> Dict:
        """Generate AI response based on section and context"""
        section = session_info["section"]
        topic = session_info["topic"]
        history = session_info["conversation_history"]

        if section == "EO1":
            # Formal service agent role
            system_prompt = f"""Tu es un agent de service téléphonique professionnel. Tu réponds aux questions d'un client qui appelle pour obtenir des informations sur: {topic.get("prompt", "")}.

Règles:
- Utilise un registre formel
- Réponds naturellement aux questions
- Si une question n'est pas claire, demande une clarification
- Ne suggère jamais de questions
- Ne donnes pas d'aide ou de conseils
- Détecte les répétitions et réponds brièvement si la question a déjà été posée"""
        else:  # EO2
            # Skeptical friend role
            counter_args = topic.get("counter_arguments", [])
            system_prompt = f"""Tu es un ami sceptique. Ton ami essaie de te convaincre de: {topic.get("prompt", "")}.

Arguments contre-possibles à utiliser:
{chr(10).join(counter_args[1:] if counter_args else [])}

Règles:
- Utilise un registre informel
- Commence neutre mais deviens plus sceptique si les arguments sont faibles
- Utilise les contre-arguments de la liste
- Interromps naturellement si nécessaire
- Ne cèdes pas trop facilement
- Ne donnes pas de leçons ou d'explications"""

        # Build conversation context
        messages = [{"role": "system", "content": system_prompt}]
        for turn in history[-5:]:  # Last 5 turns for context
            role = "user" if turn["speaker"] == "user" else "assistant"
            messages.append({"role": role, "content": turn["text"]})
        messages.append({"role": "user", "content": user_text})

        # Call OpenAI API
        response = self.openai_client.chat.completions.create(
            model="gpt-4", messages=messages, temperature=0.7, max_tokens=200
        )

        ai_text = response.choices[0].message.content

        # Add to history
        session_info["conversation_history"].append(
            {"speaker": "ai", "text": ai_text, "timestamp": None}
        )

        return {"text": ai_text}

    async def cleanup_session(self, session_id: str):
        """Clean up session resources"""
        if session_id in self.active_sessions:
            del self.active_sessions[session_id]
