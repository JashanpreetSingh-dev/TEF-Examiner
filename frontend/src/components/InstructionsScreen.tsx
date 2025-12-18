'use client';

import React from 'react';
import { ExamSection } from '@/types/exam';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface InstructionsScreenProps {
  section: ExamSection;
  onStart: () => void;
}

export const InstructionsScreen: React.FC<InstructionsScreenProps> = ({ section, onStart }) => {
  const isEO1 = section === 'EO1';
  const duration = isEO1 ? '5 minutes' : '10 minutes';
  
  const instructionText = isEO1
    ? "Vous avez lu la publicité suivante. Vous téléphonez pour obtenir plus d'informations."
    : "Vous avez lu la publicité suivante. Vous en parlez à un(e) ami(e).";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-8">
      <Card className="max-w-2xl w-full">
        <CardHeader>
          <CardTitle className="text-3xl text-center">Instructions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-lg text-center leading-relaxed">{instructionText}</p>
          <p className="text-center text-muted-foreground">
            Durée: <strong className="text-primary text-xl">{duration}</strong>
          </p>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <p className="text-yellow-800 dark:text-yellow-200 text-sm">
              ⚠️ Aucune pause, aucun retour en arrière, aucune aide ne sera fournie pendant l'examen.
            </p>
          </div>
          <Button className="w-full" size="lg" onClick={onStart}>
            Commencer l'examen
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

