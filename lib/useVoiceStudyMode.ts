"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// The Web Speech API (SpeechRecognition / webkitSpeechRecognition) has no
// official entry in TS's lib.dom yet, so these are the minimal shapes this
// hook actually touches -- not a full spec typing.
type SpeechRecognitionResultEvent = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};

interface MinimalSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => MinimalSpeechRecognition;

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

// Hands-free study primitives: speak text aloud (SpeechSynthesis) and
// listen for one spoken answer (SpeechRecognition). Deliberately generic --
// domain logic (what to say, how to match a spoken answer to a choice)
// belongs to the caller. Chrome/Edge/Safari support SpeechRecognition;
// Firefox does not, so `isSupported` must gate any voice-mode UI.
export function useVoiceStudyMode() {
  const [isSupported, setIsSupported] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<MinimalSpeechRecognition | null>(null);

  useEffect(() => {
    // Browser capability detection is only possible after mount (window is
    // unavailable during SSR, and the initial client render must match the
    // server-rendered markup) -- this is the one-time post-hydration probe
    // useEffect exists for, not app state derived from React data.
    const hasRecognition = !!getSpeechRecognitionConstructor();
    const hasSynthesis = typeof window !== "undefined" && "speechSynthesis" in window;
    setIsSupported(hasRecognition && hasSynthesis);
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.abort();
    setIsListening(false);
  }, []);

  const cancelSpeech = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, []);

  const speak = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window) || !text.trim()) {
        resolve();
        return;
      }

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1;

      setIsSpeaking(true);
      const finish = () => {
        setIsSpeaking(false);
        resolve();
      };
      utterance.onend = finish;
      utterance.onerror = finish;
      window.speechSynthesis.speak(utterance);
    });
  }, []);

  // Resolves with the transcript once, or null if unsupported/no speech
  // was recognized -- callers decide what "no answer heard" means.
  const listenOnce = useCallback((): Promise<string | null> => {
    return new Promise((resolve) => {
      const Recognition = getSpeechRecognitionConstructor();
      if (!Recognition) {
        resolve(null);
        return;
      }

      recognitionRef.current?.abort();

      const recognition = new Recognition();
      recognition.lang = "en-US";
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      let settled = false;
      const finish = (value: string | null) => {
        if (settled) return;
        settled = true;
        setIsListening(false);
        resolve(value);
      };

      recognition.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript;
        finish(transcript?.trim() || null);
      };
      recognition.onerror = () => finish(null);
      recognition.onend = () => finish(null);

      recognitionRef.current = recognition;
      setIsListening(true);

      try {
        recognition.start();
      } catch {
        finish(null);
      }
    });
  }, []);

  return { isSupported, isSpeaking, isListening, speak, listenOnce, stopListening, cancelSpeech };
}
