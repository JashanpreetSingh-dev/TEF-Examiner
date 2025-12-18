from typing import Dict


class CLBMapper:
    """Map performance metrics to CLB levels (4-12)"""

    def map_to_clb(
        self, deterministic_scores: Dict, ai_scores: Dict, section: str
    ) -> Dict:
        """Map scores to CLB level and generate results"""

        # Calculate composite score
        composite_score = self._calculate_composite_score(
            deterministic_scores, ai_scores, section
        )

        # Map to CLB level
        clb_level = self._score_to_clb(composite_score)

        # Determine readiness
        readiness = self._clb_to_readiness(clb_level)

        # Generate improvement points
        improvement_points = self._generate_improvement_points(
            deterministic_scores, ai_scores, section, clb_level
        )

        # Generate examiner explanation
        examiner_explanation = self._generate_examiner_explanation(
            clb_level, readiness, deterministic_scores, ai_scores, section
        )

        return {
            "clb_level": clb_level,
            "readiness": readiness,
            "improvement_points": improvement_points,
            "examiner_explanation": examiner_explanation,
        }

    def _calculate_composite_score(
        self, deterministic_scores: Dict, ai_scores: Dict, section: str
    ) -> float:
        """Calculate composite score from all metrics"""
        # Normalize scores to 0-10 scale

        # Deterministic factors (40% weight)
        speaking_score = min(
            deterministic_scores.get("speaking_percentage", 0) / 10, 10.0
        )
        interaction_score = min(
            deterministic_scores.get("interaction_turns", 0) * 2, 10.0
        )
        silence_penalty = deterministic_scores.get("long_silences", 0) * 0.5

        deterministic_component = (
            speaking_score + interaction_score - silence_penalty
        ) / 2

        if section == "EO1":
            question_score = min(
                deterministic_scores.get("question_count", 0) * 1.5, 10.0
            )
            repetition_penalty = deterministic_scores.get("repetition_score", 0) * 3
            deterministic_component = (
                speaking_score
                + interaction_score
                + question_score
                - repetition_penalty
                - silence_penalty
            ) / 3
        else:  # EO2
            argument_score = min(
                deterministic_scores.get("argument_count", 0) * 1.2, 10.0
            )
            deterministic_component = (
                speaking_score + interaction_score + argument_score - silence_penalty
            ) / 3

        # AI qualitative factors (60% weight)
        if isinstance(ai_scores, dict):
            if section == "EO1":
                ai_component = (
                    ai_scores.get("relevance", 5.0)
                    + ai_scores.get("variety", 5.0)
                    + ai_scores.get("politeness", 5.0)
                    + ai_scores.get("reformulation", 5.0)
                    + ai_scores.get("interaction_quality", 5.0)
                ) / 5
            else:  # EO2
                ai_component = (
                    ai_scores.get("structure", 5.0)
                    + ai_scores.get("argument_quality", 5.0)
                    + ai_scores.get("objection_handling", 5.0)
                    + ai_scores.get("fluency", 5.0)
                    + ai_scores.get("language_control", 5.0)
                ) / 5
        else:
            ai_component = 5.0  # Default if AI evaluation fails

        # Weighted composite
        composite = (deterministic_component * 0.4) + (ai_component * 0.6)

        return max(0.0, min(10.0, composite))

    def _score_to_clb(self, composite_score: float) -> int:
        """Map composite score to CLB level (4-12)"""
        # CLB mapping: 0-10 score -> 4-12 CLB
        # Linear mapping with some adjustment
        if composite_score < 2.0:
            return 4
        elif composite_score < 3.5:
            return 5
        elif composite_score < 4.5:
            return 6
        elif composite_score < 5.5:
            return 7
        elif composite_score < 6.5:
            return 8
        elif composite_score < 7.5:
            return 9
        elif composite_score < 8.5:
            return 10
        elif composite_score < 9.5:
            return 11
        else:
            return 12

    def _clb_to_readiness(self, clb_level: int) -> str:
        """Convert CLB level to readiness indicator"""
        if clb_level < 7:
            return "Not ready"
        elif clb_level <= 8:
            return "Almost"
        else:
            return "Ready"

    def _generate_improvement_points(
        self, deterministic_scores: Dict, ai_scores: Dict, section: str, clb_level: int
    ) -> list:
        """Generate maximum 3 improvement points"""
        points = []

        # Analyze weaknesses
        if deterministic_scores.get("speaking_percentage", 0) < 30:
            points.append(
                "Augmentez votre temps de parole. Parlez plus et développez vos réponses."
            )

        if deterministic_scores.get("long_silences", 0) > 3:
            points.append(
                "Réduisez les pauses longues. Pratiquez la fluidité de la parole."
            )

        if section == "EO1":
            if deterministic_scores.get("question_count", 0) < 5:
                points.append(
                    "Posez plus de questions variées pour obtenir toutes les informations nécessaires."
                )
            if deterministic_scores.get("repetition_score", 0) > 0.5:
                points.append(
                    "Évitez de répéter les mêmes questions. Variez vos formulations."
                )
        else:  # EO2
            if deterministic_scores.get("argument_count", 0) < 3:
                points.append(
                    "Développez davantage d'arguments distincts pour convaincre votre interlocuteur."
                )

        # Limit to 3 points
        return points[:3]

    def _generate_examiner_explanation(
        self,
        clb_level: int,
        readiness: str,
        deterministic_scores: Dict,
        ai_scores: Dict,
        section: str,
    ) -> str:
        """Generate examiner-style explanation"""
        explanation = f"Performance évaluée au niveau CLB {clb_level}. "

        if readiness == "Not ready":
            explanation += "Le candidat nécessite une préparation supplémentaire avant de passer l'examen officiel. "
        elif readiness == "Almost":
            explanation += "Le candidat est proche du niveau requis mais devrait continuer à pratiquer. "
        else:
            explanation += (
                "Le candidat démontre une maîtrise suffisante pour l'examen. "
            )

        # Add specific feedback
        if section == "EO1":
            explanation += f"Le candidat a posé {deterministic_scores.get('question_count', 0)} questions avec un taux de participation de {deterministic_scores.get('speaking_percentage', 0):.1f}%. "
        else:
            explanation += f"Le candidat a présenté {deterministic_scores.get('argument_count', 0)} arguments distincts avec un taux de participation de {deterministic_scores.get('speaking_percentage', 0):.1f}%. "

        explanation += (
            "Continuez à pratiquer pour améliorer votre fluidité et votre précision."
        )

        return explanation
