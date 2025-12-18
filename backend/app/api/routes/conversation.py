from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json

from app.services.conversation_service import ConversationService

router = APIRouter()
conversation_service = ConversationService()


@router.websocket("/ws/{session_id}")
async def websocket_conversation(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for real-time conversation"""
    await websocket.accept()

    try:
        # Initialize conversation for this session
        await conversation_service.initialize_session(websocket, session_id)

        while True:
            data = await websocket.receive_text()
            message = json.loads(data)

            # Handle different message types
            if message.get("type") == "audio_chunk":
                await conversation_service.handle_audio_chunk(
                    websocket, session_id, message.get("audio")
                )
            elif message.get("type") == "text_input":
                await conversation_service.handle_text_input(
                    websocket, session_id, message.get("text")
                )
            elif message.get("type") == "time_expired":
                await conversation_service.handle_time_expired(websocket, session_id)
            elif message.get("type") == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        await conversation_service.cleanup_session(session_id)
    except Exception as e:
        print(f"WebSocket error: {e}")
        await websocket.close()
