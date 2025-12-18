'use client';

import React from 'react';
import { ExamResults } from '@/types/exam';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface ResultsScreenProps {
  results: ExamResults;
  onNewExam: () => void;
}

export const ResultsScreen: React.FC<ResultsScreenProps> = ({ results, onNewExam }) => {
  const getReadinessColor = (readiness: string) => {
    switch (readiness) {
      case 'Ready':
        return '#28a745';
      case 'Almost':
        return '#ffc107';
      case 'Not ready':
        return '#dc3545';
      default:
        return '#6c757d';
    }
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl text-center">Résultats de l'examen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="bg-gradient-to-br from-purple-600 to-purple-800 text-white">
                <CardContent className="pt-6 text-center">
                  <div className="text-sm opacity-90 mb-2">Niveau CLB estimé</div>
                  <div className="text-5xl font-bold">CLB {results.clb_level}</div>
                </CardContent>
              </Card>
              
              <Card className="border-2" style={{ borderColor: getReadinessColor(results.readiness) }}>
                <CardContent className="pt-6 text-center">
                  <Badge 
                    variant="outline" 
                    className="text-lg px-4 py-2"
                    style={{ 
                      borderColor: getReadinessColor(results.readiness),
                      color: getReadinessColor(results.readiness)
                    }}
                  >
                    {results.readiness === 'Ready' && '✓ Prêt'}
                    {results.readiness === 'Almost' && '⚠ Presque prêt'}
                    {results.readiness === 'Not ready' && '✗ Pas encore prêt'}
                  </Badge>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-4 border-b pb-2">Points d'amélioration</h2>
                <ul className="space-y-2">
                  {results.improvement_points.length > 0 ? (
                    results.improvement_points.map((point, index) => (
                      <li key={index} className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-500 p-3 rounded">
                        {point}
                      </li>
                    ))
                  ) : (
                    <li className="text-muted-foreground">Aucun point d'amélioration spécifique identifié.</li>
                  )}
                </ul>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-4 border-b pb-2">Évaluation de l'examinateur</h2>
                <p className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 p-4 rounded leading-relaxed">
                  {results.examiner_explanation}
                </p>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-4 border-b pb-2">Détails techniques</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-muted p-3 rounded flex justify-between">
                    <span className="text-muted-foreground">Temps de parole:</span>
                    <span className="font-semibold">
                      {results.deterministic_scores.speaking_percentage.toFixed(1)}%
                    </span>
                  </div>
                  <div className="bg-muted p-3 rounded flex justify-between">
                    <span className="text-muted-foreground">Tours d'interaction:</span>
                    <span className="font-semibold">
                      {results.deterministic_scores.interaction_turns}
                    </span>
                  </div>
                  {results.deterministic_scores.question_count !== undefined && (
                    <div className="bg-muted p-3 rounded flex justify-between">
                      <span className="text-muted-foreground">Questions posées:</span>
                      <span className="font-semibold">
                        {results.deterministic_scores.question_count}
                      </span>
                    </div>
                  )}
                  {results.deterministic_scores.argument_count !== undefined && (
                    <div className="bg-muted p-3 rounded flex justify-between">
                      <span className="text-muted-foreground">Arguments présentés:</span>
                      <span className="font-semibold">
                        {results.deterministic_scores.argument_count}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-6 border-t">
              <Button className="w-full" size="lg" onClick={onNewExam}>
                Nouvel examen
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

