'use client';

import React from 'react';
import { ExamSection } from '@/types/exam';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface SectionSelectorProps {
  onSelect: (section: ExamSection) => void;
}

export const SectionSelector: React.FC<SectionSelectorProps> = ({ onSelect }) => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 to-purple-800 p-8">
      <div className="max-w-6xl w-full text-center">
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">
          TEF Canada – Expression Orale Simulator
        </h1>
        <p className="text-xl text-white/90 mb-8">Choisissez une section d'examen</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
          <Card className="cursor-pointer hover:shadow-xl transition-shadow" onClick={() => onSelect('EO1')}>
            <CardHeader>
              <CardTitle>Section A (EO1)</CardTitle>
              <CardDescription>Poser des questions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 mb-6">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Durée:</span>
                  <span className="font-semibold">5 minutes</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Registre:</span>
                  <span className="font-semibold">Formel</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Objectif:</span>
                  <span className="font-semibold">Poser ~10 questions pertinentes</span>
                </div>
              </div>
              <Button className="w-full" size="lg">Commencer</Button>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-xl transition-shadow" onClick={() => onSelect('EO2')}>
            <CardHeader>
              <CardTitle>Section B (EO2)</CardTitle>
              <CardDescription>Convaincre un ami</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 mb-6">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Durée:</span>
                  <span className="font-semibold">10 minutes</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Registre:</span>
                  <span className="font-semibold">Informel</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Objectif:</span>
                  <span className="font-semibold">Convaincre avec arguments</span>
                </div>
              </div>
              <Button className="w-full" size="lg">Commencer</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

