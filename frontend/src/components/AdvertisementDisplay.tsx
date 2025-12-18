'use client';

import React, { useEffect, useState } from 'react';
import { Topic } from '@/types/exam';
import { Badge } from '@/components/ui/badge';

interface AdvertisementDisplayProps {
  topic: Topic;
  onReady: () => void;
}

export const AdvertisementDisplay: React.FC<AdvertisementDisplayProps> = ({ topic, onReady }) => {
  const [countdown, setCountdown] = useState(15);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    if (imageLoaded && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (imageLoaded && countdown === 0) {
      onReady();
    }
  }, [countdown, imageLoaded, onReady]);

  const imagePath = topic.image || 
    (topic.section === 'EO1' 
      ? `/section_a_images/section_a_image_${topic.id}.png`
      : `/section_b_images/section_b_image_${topic.id}.png`);

  return (
    <div className="min-h-screen flex items-center justify-center bg-black p-8">
      <div className="relative max-w-full max-h-[90vh] flex items-center justify-center">
        <Badge className="absolute top-4 right-4 z-10 bg-black/70 text-white border-none">
          Lecture silencieuse: {countdown} secondes
        </Badge>
        <img
          src={imagePath}
          alt="Advertisement"
          className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
          onLoad={() => setImageLoaded(true)}
          onError={(e) => {
            console.error('Image load error:', e);
            setImageLoaded(true); // Continue even if image fails
          }}
        />
      </div>
    </div>
  );
};

