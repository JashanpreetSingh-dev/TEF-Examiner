import os
import re
import json
from typing import List, Dict
from openai import OpenAI


class ScoringService:
    def __init__(self):
        self.openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    def calculate_deterministic_scores(
        self,
        transcript: List[Dict],
        section: str,
        speaking_time_sec: float,
        total_time_sec: float,
    ) -> Dict:
        """Layer 1: Calculate deterministic metrics"""
        user_utterances = [u for u in transcript if u.get("speaker") == "user"]
        ai_utterances = [u for u in transcript if u.get("speaker") == "ai"]

        # Calculate speaking time percentage
        speaking_percentage = (
            (speaking_time_sec / total_time_sec * 100) if total_time_sec > 0 else 0
        )

        # Calculate silence duration (gaps > 3 seconds)
        long_silences = 0
        for i in range(len(user_utterances) - 1):
            if user_utterances[i].get("timestamp") and user_utterances[i + 1].get(
                "timestamp"
            ):
                gap = (
                    user_utterances[i + 1]["timestamp"]
                    - user_utterances[i]["timestamp"]
                )
                if gap > 3.0:
                    long_silences += 1

        # Count interaction turns
        interaction_turns = len(user_utterances)

        scores = {
            "speaking_time_sec": speaking_time_sec,
            "speaking_percentage": speaking_percentage,
            "long_silences": long_silences,
            "interaction_turns": interaction_turns,
        }

        if section == "EO1":
            # Count questions
            question_count = self._count_questions(user_utterances)
            # Detect repetition
            repetition_score = self._detect_repetition(user_utterances)

            scores.update(
                {"question_count": question_count, "repetition_score": repetition_score}
            )
        else:  # EO2
            # Count distinct arguments
            argument_count = self._count_arguments(user_utterances)

            scores.update({"argument_count": argument_count})

        return scores

    def _count_questions(self, utterances: List[Dict]) -> int:
        """Count questions in user utterances"""
        question_patterns = [
            r"\?",  # Question mark
            r"\b(qui|que|quoi|où|quand|comment|pourquoi|combien|est-ce|avez-vous|avez|êtes|pouvez)\b",
            r"\b(quel|quelle|quels|quelles)\b",
        ]

        count = 0
        for utterance in utterances:
            text = utterance.get("text", "").lower()
            if any(
                re.search(pattern, text, re.IGNORECASE) for pattern in question_patterns
            ):
                count += 1

        return count

    def _detect_repetition(self, utterances: List[Dict]) -> float:
        """Detect repetition in questions (0.0 = no repetition, 1.0 = high repetition)"""
        if len(utterances) < 2:
            return 0.0

        texts = [u.get("text", "").lower() for u in utterances]
        similarities = []

        for i in range(len(texts)):
            for j in range(i + 1, len(texts)):
                similarity = self._text_similarity(texts[i], texts[j])
                similarities.append(similarity)

        if not similarities:
            return 0.0

        # Return average similarity (higher = more repetition)
        return sum(similarities) / len(similarities)

    def _text_similarity(self, text1: str, text2: str) -> float:
        """Simple similarity score between two texts"""
        words1 = set(text1.split())
        words2 = set(text2.split())

        if not words1 or not words2:
            return 0.0

        intersection = words1.intersection(words2)
        union = words1.union(words2)

        return len(intersection) / len(union) if union else 0.0

    def _count_arguments(self, utterances: List[Dict]) -> int:
        """Count distinct arguments in user utterances"""
        # Simple heuristic: count sentences that are not questions
        argument_count = 0
        for utterance in utterances:
            text = utterance.get("text", "")
            # Count sentences that don't end with ?
            sentences = re.split(r"[.!?]", text)
            argument_count += len(
                [s for s in sentences if s.strip() and not s.strip().endswith("?")]
            )

        return argument_count

    async def evaluate_qualitative(
        self, transcript: List[Dict], section: str, topic_id: int
    ) -> Dict:
        """Layer 2: AI-assisted qualitative evaluation"""
        user_text = " ".join(
            [u.get("text", "") for u in transcript if u.get("speaker") == "user"]
        )

        if section == "EO1":
            evaluation_prompt = f"""Évalue la performance d'un candidat au TEF Canada Section EO1 (Poser des questions).

Transcription de l'utilisateur:
{user_text}

Évalue sur une échelle de 0 à 10:
1. Pertinence des questions (les questions sont-elles pertinentes au sujet?)
2. Variété des formes de questions
3. Politesse et registre formel
4. Capacité de reformulation
5. Qualité de l'interaction

Réponds en JSON avec les scores et un commentaire pour chaque critère."""
        else:  # EO2
            evaluation_prompt = f"""Évalue la performance d'un candidat au TEF Canada Section EO2 (Convaincre un ami).

Transcription de l'utilisateur:
{user_text}

Évalue sur une échelle de 0 à 10:
1. Structure (introduction → arguments → conclusion)
2. Qualité des arguments
3. Réaction aux objections
4. Fluidité
5. Maîtrise de la langue

Réponds en JSON avec les scores et un commentaire pour chaque critère."""

        response = self.openai_client.chat.completions.create(
            model="gpt-4",
            messages=[
                {
                    "role": "system",
                    "content": "Tu es un examinateur expert du TEF Canada. Évalue objectivement la performance.",
                },
                {"role": "user", "content": evaluation_prompt},
            ],
            temperature=0.3,
            response_format={"type": "json_object"},
        )

        try:
            evaluation = json.loads(response.choices[0].message.content)
            # Normalize field names based on section
            if section == "EO1":
                return {
                    "relevance": evaluation.get(
                        "relevance", evaluation.get("pertinence", 5.0)
                    ),
                    "variety": evaluation.get(
                        "variety", evaluation.get("variete", 5.0)
                    ),
                    "politeness": evaluation.get(
                        "politeness", evaluation.get("politesse", 5.0)
                    ),
                    "reformulation": evaluation.get("reformulation", 5.0),
                    "interaction_quality": evaluation.get(
                        "interaction_quality",
                        evaluation.get("qualite_interaction", 5.0),
                    ),
                }
            else:  # EO2
                return {
                    "structure": evaluation.get("structure", 5.0),
                    "argument_quality": evaluation.get(
                        "argument_quality", evaluation.get("qualite_arguments", 5.0)
                    ),
                    "objection_handling": evaluation.get(
                        "objection_handling", evaluation.get("reaction_objections", 5.0)
                    ),
                    "fluency": evaluation.get(
                        "fluency", evaluation.get("fluidite", 5.0)
                    ),
                    "language_control": evaluation.get(
                        "language_control", evaluation.get("maitrise_langue", 5.0)
                    ),
                }
        except Exception as e:
            print(f"Error parsing AI evaluation: {e}")
            # Fallback if JSON parsing fails
            if section == "EO1":
                return {
                    "relevance": 5.0,
                    "variety": 5.0,
                    "politeness": 5.0,
                    "reformulation": 5.0,
                    "interaction_quality": 5.0,
                }
            else:
                return {
                    "structure": 5.0,
                    "argument_quality": 5.0,
                    "objection_handling": 5.0,
                    "fluency": 5.0,
                    "language_control": 5.0,
                }
