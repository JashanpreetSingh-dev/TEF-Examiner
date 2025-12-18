import React, { useState, useEffect } from 'react';
import { SectionSelector } from './components/SectionSelector';
import { InstructionsScreen } from './components/InstructionsScreen';
import { AdvertisementDisplay } from './components/AdvertisementDisplay';
import { ExamRunner } from './components/ExamRunner';
import { ResultsScreen } from './components/ResultsScreen';
import { ExamSection, ExamState, Topic, ExamSession, TranscriptEntry, ExamResults } from './types/exam';
import { examAPI } from './services/api';
import { ExamStateMachine } from './state/examStateMachine';
import './App.css';

function App() {
  const [currentState, setCurrentState] = useState<ExamState>('idle');
  const [selectedSection, setSelectedSection] = useState<ExamSection | null>(null);
  const [session, setSession] = useState<ExamSession | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [results, setResults] = useState<ExamResults | null>(null);
  const [stateMachine] = useState(new ExamStateMachine());
  const [examStartTime, setExamStartTime] = useState<number | null>(null);
  const [speakingTime, setSpeakingTime] = useState(0);

  const handleSectionSelect = async (section: ExamSection) => {
    setSelectedSection(section);
    if (stateMachine.transition('selection')) {
      setCurrentState('selection');
      // Auto-transition to instructions
      setTimeout(() => {
        if (stateMachine.transition('instructions')) {
          setCurrentState('instructions');
        }
      }, 100);
    }
  };

  const handleStartExam = async () => {
    if (!selectedSection) return;

    try {
      const newSession = await examAPI.startSession(selectedSection);
      setSession(newSession);
      setExamStartTime(Date.now());
      
      if (stateMachine.transition('ad_display')) {
        setCurrentState('ad_display');
      }
    } catch (error) {
      console.error('Error starting session:', error);
      alert('Erreur lors du démarrage de l\'examen. Veuillez réessayer.');
    }
  };

  const handleAdReady = () => {
    if (stateMachine.transition('exam_active')) {
      setCurrentState('exam_active');
    }
  };

  const handleTimeExpired = async () => {
    if (stateMachine.transition('time_expired')) {
      setCurrentState('time_expired');
      
      // Transition to grading
      if (stateMachine.transition('grading')) {
        setCurrentState('grading');
        
        // Calculate final metrics
        const totalTime = session?.topic.time_limit_sec || 0;
        
        // Evaluate exam
        try {
          if (session) {
            const examResults = await examAPI.evaluateExam(
              session.session_id,
              transcript,
              session.section,
              session.topic.id,
              speakingTime,
              totalTime
            );
            
            setResults(examResults);
            
            // End session
            await examAPI.endSession(session.session_id);
            
            // Transition to results
            if (stateMachine.transition('results')) {
              setCurrentState('results');
            }
          }
        } catch (error) {
          console.error('Error evaluating exam:', error);
          alert('Erreur lors de l\'évaluation. Veuillez réessayer.');
        }
      }
    }
  };

  const handleTranscriptUpdate = (newTranscript: TranscriptEntry[]) => {
    setTranscript(newTranscript);
    
    // Calculate speaking time from transcript
    const userEntries = newTranscript.filter(e => e.speaker === 'user');
    // Rough estimate: average speaking rate
    const estimatedTime = userEntries.reduce((acc, entry) => {
      const wordCount = entry.text.split(' ').length;
      return acc + (wordCount * 0.5); // ~0.5 seconds per word
    }, 0);
    setSpeakingTime(estimatedTime);
  };

  const handleNewExam = () => {
    // Reset everything
    stateMachine.reset();
    setCurrentState('idle');
    setSelectedSection(null);
    setSession(null);
    setTranscript([]);
    setResults(null);
    setExamStartTime(null);
    setSpeakingTime(0);
  };

  // Render based on current state
  switch (currentState) {
    case 'idle':
    case 'selection':
      return <SectionSelector onSelect={handleSectionSelect} />;
    
    case 'instructions':
      return selectedSection ? (
        <InstructionsScreen section={selectedSection} onStart={handleStartExam} />
      ) : null;
    
    case 'ad_display':
      return session ? (
        <AdvertisementDisplay topic={session.topic} onReady={handleAdReady} />
      ) : null;
    
    case 'exam_active':
    case 'time_expired':
      return session ? (
        <ExamRunner
          sessionId={session.session_id}
          topic={session.topic}
          onTimeExpired={handleTimeExpired}
          onTranscriptUpdate={handleTranscriptUpdate}
        />
      ) : null;
    
    case 'grading':
      return (
        <div className="grading-screen">
          <div className="grading-container">
            <h1>Évaluation en cours...</h1>
            <p>Veuillez patienter pendant que nous analysons votre performance.</p>
            <div className="loading-spinner"></div>
          </div>
        </div>
      );
    
    case 'results':
      return results ? (
        <ResultsScreen results={results} onNewExam={handleNewExam} />
      ) : null;
    
    default:
      return <SectionSelector onSelect={handleSectionSelect} />;
  }
}

export default App;

