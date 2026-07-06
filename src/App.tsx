/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Castle, 
  Anchor, 
  Scroll, 
  BookOpen, 
  RotateCcw, 
  Check, 
  HelpCircle, 
  X, 
  Trophy, 
  ArrowRight,
  GripHorizontal,
  ChevronRight,
  Calendar,
  AlertCircle,
  Info,
  Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from './lib/firebase';
import { handleFirestoreError, OperationType } from './lib/firebase-utils';
import { collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp } from 'firebase/firestore';

// Define structure of historical events
interface HistoryEvent {
  id: string;
  title: string;
  year: number;
  era: string;
  description: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  themeColor: string;
  lightBg: string;
  glowColor: string;
  icon: React.ComponentType<{ className?: string }>;
}

// Define structure of leaderboard entries
interface LeaderboardEntry {
  id: string;
  name: string;
  timeInSeconds: number;
  date: string;
}

// 4 Taiwan Historical Events requested by user
const EVENTS_DATA: HistoryEvent[] = [
  {
    id: '1624',
    title: '荷蘭人建立熱蘭遮城',
    year: 1624,
    era: '荷西時期',
    description: '荷蘭東印度公司於大員（今台南安平）興建熱蘭遮城，作為貿易與傳教據點，開啟台灣殖民史篇章。',
    badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    badgeText: 'text-emerald-700',
    badgeBorder: 'border-emerald-200',
    themeColor: 'border-emerald-200 hover:border-emerald-400 hover:shadow-emerald-50',
    lightBg: 'bg-emerald-50/30',
    glowColor: 'ring-emerald-400/30',
    icon: Castle,
  },
  {
    id: '1662',
    title: '鄭成功擊敗荷軍登台',
    year: 1662,
    era: '明鄭時期',
    description: '延平郡王鄭成功率軍渡海包圍熱蘭遮城，荷蘭揆一投降，結束荷蘭在台統治，開啟漢人政權治理。',
    badgeBg: 'bg-sky-50 text-sky-700 border-sky-200',
    badgeText: 'text-sky-700',
    badgeBorder: 'border-sky-200',
    themeColor: 'border-sky-200 hover:border-sky-400 hover:shadow-sky-50',
    lightBg: 'bg-sky-50/30',
    glowColor: 'ring-sky-400/30',
    icon: Anchor,
  },
  {
    id: '1683',
    title: '施琅攻台開啟清領時期',
    year: 1683,
    era: '清領時期',
    description: '施琅率領清軍於澎湖海戰大敗明鄭守軍，鄭克塽降清，台灣納入清帝國版圖，開啟清領時期。',
    badgeBg: 'bg-amber-50 text-amber-700 border-amber-200',
    badgeText: 'text-amber-700',
    badgeBorder: 'border-amber-200',
    themeColor: 'border-amber-200 hover:border-amber-400 hover:shadow-amber-50',
    lightBg: 'bg-amber-50/30',
    glowColor: 'ring-amber-400/30',
    icon: Scroll,
  },
  {
    id: '1895',
    title: '馬關條約開啟日治時期',
    year: 1895,
    era: '日治時期',
    description: '清朝於甲午戰爭落敗，簽訂《馬關條約》將台澎割讓給日本，台灣總督府展開統治與現代化建設。',
    badgeBg: 'bg-rose-50 text-rose-700 border-rose-200',
    badgeText: 'text-rose-700',
    badgeBorder: 'border-rose-200',
    themeColor: 'border-rose-200 hover:border-rose-400 hover:shadow-rose-50',
    lightBg: 'bg-rose-50/30',
    glowColor: 'ring-rose-400/30',
    icon: BookOpen,
  },
];

const CORRECT_ORDER = ['1624', '1662', '1683', '1895'];

// Helper to shuffle array
const shuffleArray = (array: string[]) => {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

// Guarantee a shuffle that is NOT in correct order
const getShuffledPool = () => {
  let shuffled = shuffleArray(CORRECT_ORDER);
  while (JSON.stringify(shuffled) === JSON.stringify(CORRECT_ORDER)) {
    shuffled = shuffleArray(CORRECT_ORDER);
  }
  return shuffled;
};

export default function App() {
  // State variables
  const [pool, setPool] = useState<string[]>([]);
  const [slots, setSlots] = useState<(string | null)[]>([null, null, null, null]);
  
  // Drag and drop tracking
  const [draggedItem, setDraggedItem] = useState<{ id: string; source: 'pool' | number } | null>(null);
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);
  const [hoveredPool, setHoveredPool] = useState<boolean>(false);
  
  // Modals & Notifications
  const [showErrorModal, setShowErrorModal] = useState<boolean>(false);
  const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false);
  const [showHelpModal, setShowHelpModal] = useState<boolean>(false);
  const [correctCount, setCorrectCount] = useState<number>(0);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

  // Timer & Leaderboard State
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [timerStarted, setTimerStarted] = useState<boolean>(false);
  const [timerRunning, setTimerRunning] = useState<boolean>(false);
  const [playerName, setPlayerName] = useState<string>('');
  const [hasSubmitted, setHasSubmitted] = useState<boolean>(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  // Initialize game and Firebase listeners
  useEffect(() => {
    resetGame();
    
    // Set up realtime listener for the leaderboard
    const q = query(collection(db, 'leaderboard'), orderBy('timeInSeconds', 'asc'), limit(10));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const entries: LeaderboardEntry[] = [];
      snapshot.forEach((doc) => {
        entries.push({ id: doc.id, ...doc.data() } as LeaderboardEntry);
      });
      setLeaderboard(entries);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'leaderboard');
    });

    return () => unsubscribe();
  }, []);

  // Timer effect
  useEffect(() => {
    let interval: any = null;
    if (timerRunning) {
      interval = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else if (interval) {
      clearInterval(interval);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timerRunning]);

  // Clear alert message after timeout
  useEffect(() => {
    if (alertMessage) {
      const timer = setTimeout(() => {
        setAlertMessage(null);
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [alertMessage]);

  const resetGame = () => {
    setPool(getShuffledPool());
    setSlots([null, null, null, null]);
    setDraggedItem(null);
    setHoveredSlot(null);
    setHoveredPool(false);
    setIsCorrect(null);
    setShowErrorModal(false);
    setShowSuccessModal(false);
    
    // Reset timer state
    setElapsedTime(0);
    setTimerStarted(false);
    setTimerRunning(false);
    setHasSubmitted(false);
    setPlayerName('');
  };

  const startTimerIfNeeded = () => {
    if (!timerStarted) {
      setTimerStarted(true);
      setTimerRunning(true);
    }
  };

  const saveLeaderboardEntry = async (nameToSave: string) => {
    if (hasSubmitted) return;
    setHasSubmitted(true);
    
    const finalName = nameToSave.trim() || '無名博學家';
    
    try {
      await addDoc(collection(db, 'leaderboard'), {
        name: finalName,
        timeInSeconds: elapsedTime,
        date: new Date().toLocaleDateString('zh-TW', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
        createdAt: Date.now()
      });
    } catch (e) {
      setAlertMessage('網路錯誤，分數登錄失敗！');
      setHasSubmitted(false);
      handleFirestoreError(e, OperationType.CREATE, 'leaderboard');
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Trigger confetti celebrate
  const triggerConfetti = () => {
    const globalWindow = window as any;
    if (!globalWindow.confetti) return;
    
    // Left side burst
    globalWindow.confetti({
      particleCount: 100,
      spread: 70,
      origin: { x: 0.1, y: 0.5 }
    });
    
    // Right side burst
    setTimeout(() => {
      globalWindow.confetti({
        particleCount: 100,
        spread: 70,
        origin: { x: 0.9, y: 0.5 }
      });
    }, 200);

    // Center splash
    setTimeout(() => {
      globalWindow.confetti({
        particleCount: 150,
        spread: 100,
        origin: { x: 0.5, y: 0.4 }
      });
    }, 450);
  };

  // Click-to-place helper (Pragmatic mobile enhancement)
  const handleCardClick = (cardId: string, fromIndex?: number) => {
    startTimerIfNeeded();
    if (fromIndex !== undefined) {
      // Return to pool from slot
      const newSlots = [...slots];
      newSlots[fromIndex] = null;
      setSlots(newSlots);
      
      if (!pool.includes(cardId)) {
        setPool([...pool, cardId]);
      }
      setIsCorrect(null);
    } else {
      // Move from pool to the first empty slot
      const firstEmptyIndex = slots.findIndex(slot => slot === null);
      if (firstEmptyIndex !== -1) {
        const newSlots = [...slots];
        newSlots[firstEmptyIndex] = cardId;
        setSlots(newSlots);
        setPool(pool.filter(id => id !== cardId));
        setIsCorrect(null);
      } else {
        setAlertMessage("時間軸上的空槽已滿囉！可以先點擊卡片將它收回。");
      }
    }
  };

  // HTML5 Drag Handlers
  const handleDragStart = (e: React.DragEvent, cardId: string, source: 'pool' | number) => {
    setDraggedItem({ id: cardId, source });
    e.dataTransfer.setData("text/plain", cardId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setHoveredSlot(null);
    setHoveredPool(false);
  };

  const handleDragOverSlot = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (hoveredSlot !== index) {
      setHoveredSlot(index);
    }
  };

  const handleDragLeaveSlot = () => {
    setHoveredSlot(null);
  };

  const handleDragOverPool = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!hoveredPool) {
      setHoveredPool(true);
    }
  };

  const handleDragLeavePool = () => {
    setHoveredPool(false);
  };

  const handleDropOnSlot = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (!draggedItem) return;

    startTimerIfNeeded();
    const cardId = draggedItem.id;
    const source = draggedItem.source;
    const newSlots = [...slots];
    
    if (source === 'pool') {
      const currentOccupant = slots[targetIndex];
      if (currentOccupant) {
        // Swap: existing occupant returned to pool
        newSlots[targetIndex] = cardId;
        setPool([...pool.filter(id => id !== cardId), currentOccupant]);
      } else {
        // Simple placement
        newSlots[targetIndex] = cardId;
        setPool(pool.filter(id => id !== cardId));
      }
    } else {
      const sourceIndex = source;
      if (sourceIndex === targetIndex) return; // Dropped on same spot
      
      const currentOccupant = slots[targetIndex];
      newSlots[targetIndex] = cardId;
      newSlots[sourceIndex] = currentOccupant; // Swaps even if null
    }

    setSlots(newSlots);
    setIsCorrect(null);
    setDraggedItem(null);
    setHoveredSlot(null);
  };

  const handleDropOnPool = (e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedItem) return;

    startTimerIfNeeded();
    const cardId = draggedItem.id;
    const source = draggedItem.source;

    if (source !== 'pool') {
      const newSlots = [...slots];
      newSlots[source] = null;
      setSlots(newSlots);
      
      if (!pool.includes(cardId)) {
        setPool([...pool, cardId]);
      }
    }

    setIsCorrect(null);
    setDraggedItem(null);
    setHoveredPool(false);
  };

  // Validate user's timeline sorting
  const handleCheckAnswer = () => {
    const filledSlotsCount = slots.filter(id => id !== null).length;
    if (filledSlotsCount < 4) {
      setAlertMessage("請先將所有 4 張歷史卡片拖曳放置於時間軸上！");
      return;
    }

    let correct = 0;
    for (let i = 0; i < 4; i++) {
      if (slots[i] === CORRECT_ORDER[i]) {
        correct++;
      }
    }

    setCorrectCount(correct);

    if (correct === 4) {
      setIsCorrect(true);
      setShowSuccessModal(true);
      setTimerRunning(false); // Stop the timer!
      triggerConfetti();
    } else {
      setIsCorrect(false);
      setShowErrorModal(true);
    }
  };

  // Find event details helper
  const getEventById = (id: string | null): HistoryEvent | undefined => {
    if (!id) return undefined;
    return EVENTS_DATA.find(e => e.id === id);
  };

  return (
    <div className="min-h-screen bg-[#f5f2ed] text-[#2c2c2c] font-sans antialiased relative overflow-x-hidden flex flex-col justify-between">
      {/* Visual background accents */}
      <div className="absolute top-0 left-0 w-full h-1 bg-[#4a3f35]"></div>
      
      {/* Main Container */}
      <div className="max-w-4xl mx-auto px-4 py-8 w-full flex-grow flex flex-col justify-center gap-8">
        
        {/* Header Section */}
        <header className="text-center relative max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#edeae4] border border-[#d4d1cc] rounded-full text-[11px] text-[#4a3f35] font-bold tracking-widest uppercase mb-4">
            <Calendar className="w-3.5 h-3.5" />
            <span>台灣歷史序位挑戰</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-serif font-light tracking-widest uppercase border-b border-[#d4d1cc] pb-4 inline-block mb-4 text-[#2c2c2c] w-full">
            台灣歷史事件排序
          </h1>
          <p className="text-sm md:text-base italic text-stone-500 font-serif leading-relaxed">
            歷史如長河，試著將下列四個關鍵的轉折時刻，依據發生的時間先後，從左至右移入下方的時間軸中。
          </p>

          {/* Dynamic running stopwatch timer */}
          <div className="inline-flex justify-center items-center gap-2.5 mt-5 font-mono text-xs tracking-widest text-stone-600 bg-stone-100 px-4 py-1.5 rounded-full border border-stone-200">
            <Clock className={`w-3.5 h-3.5 text-stone-500 ${timerRunning ? 'animate-pulse text-amber-800' : ''}`} />
            <span className="uppercase font-sans font-bold text-[10px]">累積時間:</span>
            <span className="text-stone-900 font-bold tabular-nums">
              {formatTime(elapsedTime)}
            </span>
          </div>
        </header>

        {/* Alert Popup (Toast Style) */}
        <AnimatePresence>
          {alertMessage && (
            <motion.div 
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-[#4a3f35] text-[#f5f2ed] shadow-xl px-5 py-3 rounded border border-stone-600 text-xs tracking-wider uppercase font-bold flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 text-amber-300 flex-shrink-0" />
              <span>{alertMessage}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Card Pool Area (Top) */}
        <section className="w-full">
          <div 
            id="pool-zone"
            onDragOver={handleDragOverPool}
            onDragLeave={handleDragLeavePool}
            onDrop={handleDropOnPool}
            className={`w-full min-h-[190px] rounded-lg border border-stone-200 transition-all duration-300 p-6 flex flex-col items-center justify-center relative ${
              hoveredPool 
                ? 'bg-[#edebe5] border-stone-400 scale-[0.99]' 
                : 'bg-white/60 shadow-sm'
            }`}
          >
            {/* Header label inside pool */}
            <div className="absolute top-4 left-6 flex items-center gap-1.5 text-[10px] font-bold text-stone-400 tracking-widest uppercase select-none">
              <span className="w-1.5 h-1.5 rounded-full bg-stone-400"></span>
              事件卡池 (點擊或拖曳)
            </div>

            <div className="w-full flex flex-wrap gap-4 justify-center items-center mt-6">
              <AnimatePresence mode="popLayout">
                {pool.length > 0 ? (
                  pool.map((id) => {
                    const event = getEventById(id);
                    if (!event) return null;
                    const IconComp = event.icon;
                    const isBeingDragged = draggedItem?.id === id;

                    return (
                      <motion.div
                        key={id}
                        id={`card-${id}`}
                        layoutId={`card-${id}`}
                        draggable="true"
                        onDragStart={(e) => handleDragStart(e, id, 'pool')}
                        onDragEnd={handleDragEnd}
                        onClick={() => handleCardClick(id)}
                        whileHover={{ scale: 1.02, y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        className={`group cursor-grab active:cursor-grabbing w-full sm:w-[220px] bg-white rounded-lg border p-5 transition-all duration-300 relative text-left ${
                          isBeingDragged 
                            ? 'opacity-40 border-dashed border-stone-300 shadow-none' 
                            : 'border-stone-200 shadow-md hover:border-stone-400 hover:shadow-lg'
                        }`}
                      >
                        {/* Drag and click cues */}
                        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center gap-1 text-slate-400">
                          <span className="text-[9px] bg-stone-100 px-1.5 py-0.5 rounded text-stone-500 uppercase tracking-tight">放置</span>
                          <GripHorizontal className="w-3.5 h-3.5" />
                        </div>

                        {/* Era Badge */}
                        <div className="text-[10px] font-sans uppercase tracking-widest text-amber-800 mb-2 font-bold">
                          {event.era}
                        </div>

                        {/* Icon & Title */}
                        <div className="flex items-start gap-2.5">
                          <div className="p-1.5 bg-stone-50 rounded text-stone-700 flex-shrink-0">
                            <IconComp className="w-4 h-4" />
                          </div>
                          <div>
                            <h3 className="font-serif font-medium text-stone-800 text-sm md:text-base leading-tight group-hover:text-stone-950 transition-colors">
                              {event.title}
                            </h3>
                          </div>
                        </div>

                        {/* Description */}
                        <p className="text-xs text-stone-500 font-sans leading-relaxed mt-3 border-t border-stone-100 pt-2.5">
                          {event.description}
                        </p>
                      </motion.div>
                    );
                  })
                ) : (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center justify-center py-6 text-stone-400 text-center"
                  >
                    <Check className="w-8 h-8 text-stone-600 mb-2 bg-stone-100 p-1.5 rounded-full" />
                    <p className="text-sm font-serif italic text-stone-600">所有事件皆已入座</p>
                    <p className="text-xs text-stone-400 font-sans mt-1">您可以隨時進行調整，或點選下方「檢查答案」按鈕。</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </section>

        {/* Timeline Area (Bottom) */}
        <section className="w-full mt-2 relative">
          <div className="text-center md:text-left mb-6 flex items-center justify-between">
            <h2 className="text-base font-serif font-medium text-stone-800 flex items-center gap-2 tracking-wider">
              <span className="flex items-center justify-center w-6 h-6 rounded bg-stone-200 text-stone-800 text-xs font-serif font-bold">
                01
              </span>
              歷史事件時間軸
            </h2>
            <span className="text-xs text-stone-400 flex items-center gap-1 font-sans uppercase tracking-wider hidden md:flex">
              時間先後順序
              <ArrowRight className="w-3 h-3 text-stone-400" />
            </span>
          </div>

          {/* Timeline Connector Lines */}
          <div className="absolute top-0 bottom-0 left-0 right-0 pointer-events-none -z-10">
            {/* Horizontal Line for Desktop */}
            <div className="hidden md:block absolute left-[12%] right-[12%] top-[38%] h-[1px] bg-stone-300 rounded-full"></div>
            {/* Vertical Line for Mobile */}
            <div className="block md:hidden absolute left-[39px] top-6 bottom-6 w-[1px] bg-stone-300 rounded-full"></div>
          </div>

          {/* Time Flow Slots */}
          <div className="relative flex flex-col md:flex-row gap-6 md:gap-4 justify-between items-stretch md:items-start">
            
            {slots.map((cardId, index) => {
              const event = getEventById(cardId);
              const isSlotHovered = hoveredSlot === index;
              const isDraggingActive = draggedItem !== null;
              
              // Map slot indices to user-friendly titles
              const slotLabels = [
                { title: '最早事件', number: '01' },
                { title: '次要順序', number: '02' },
                { title: '後續發展', number: '03' },
                { title: '最晚事件', number: '04' }
              ];

              return (
                <div 
                  key={index}
                  className="flex items-center md:flex-col gap-4 md:gap-2 w-full md:w-1/4 relative group"
                >
                  {/* Left Index Indicator (Mobile only) */}
                  <div className="flex-shrink-0 w-20 text-right pr-4 font-sans font-bold text-[10px] text-stone-400 uppercase tracking-widest md:hidden flex flex-col justify-center">
                    <span className="text-stone-800 font-serif font-black text-sm">{slotLabels[index].number}</span>
                    <span>{slotLabels[index].title}</span>
                  </div>

                  {/* Dot Marker (Responsive placement) */}
                  <div className="absolute left-[34px] md:left-auto md:relative w-2.5 h-2.5 rounded-full bg-white border border-stone-400 z-10 transition-colors duration-300 md:mb-2 group-hover:bg-[#4a3f35]"></div>

                  {/* Drop Zone Box */}
                  <div
                    onDragOver={(e) => handleDragOverSlot(e, index)}
                    onDragLeave={handleDragLeaveSlot}
                    onDrop={(e) => handleDropOnSlot(e, index)}
                    className={`flex-grow md:w-full min-h-[160px] rounded-lg border transition-all duration-300 flex flex-col items-center justify-center p-3 text-center ${
                      event 
                        ? 'bg-white border-stone-200 shadow-md' 
                        : isSlotHovered
                          ? 'bg-stone-200/50 border-stone-400 border-solid scale-[1.02]'
                          : isDraggingActive
                            ? 'bg-stone-50 border-stone-300 border-dashed animate-pulse'
                            : 'bg-stone-100/40 border-dashed border-stone-300'
                    }`}
                  >
                    {event ? (
                      /* Docked Card Layout */
                      <motion.div
                        layoutId={`card-${cardId}`}
                        draggable="true"
                        onDragStart={(e) => handleDragStart(e, cardId, index)}
                        onDragEnd={handleDragEnd}
                        onClick={() => handleCardClick(cardId, index)}
                        className={`w-full h-full text-left bg-white p-3 rounded transition-all relative ${
                          draggedItem?.id === cardId ? 'opacity-30' : 'cursor-grab hover:shadow-sm'
                        }`}
                      >
                        <div className="absolute top-2 right-2 opacity-0 hover:opacity-100 md:opacity-100 transition-opacity flex items-center gap-1">
                          <span className="text-[8px] bg-stone-100 px-1 py-0.5 rounded text-stone-400">收回</span>
                          <X className="w-3 h-3 text-stone-400 hover:text-stone-600 cursor-pointer" />
                        </div>

                        {/* Era and title */}
                        <div className="mb-2">
                          <span className="inline-block text-[9px] font-sans uppercase tracking-wider text-amber-800 font-bold bg-stone-100 px-1.5 py-0.2 rounded">
                            {event.era}
                          </span>
                        </div>
                        <h4 className="font-serif font-bold text-[#2c2c2c] text-xs md:text-sm line-clamp-2 leading-snug">
                          {event.title}
                        </h4>
                        
                        {/* Shortened description for slot display */}
                        <p className="text-[11px] text-stone-500 font-sans mt-2 line-clamp-3 leading-relaxed border-t border-stone-100 pt-1.5">
                          {event.description}
                        </p>
                      </motion.div>
                    ) : (
                      /* Empty Slot Placeholder */
                      <div className="py-6 px-4 flex flex-col items-center justify-center select-none pointer-events-none">
                        <span className="text-3xl md:text-4xl font-serif font-black text-stone-200/80">
                          {slotLabels[index].number}
                        </span>
                        <span className="text-[10px] uppercase font-sans text-stone-400 mt-2 tracking-widest">
                          {slotLabels[index].title}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Desktop Under-Slot Label */}
                  <div className="hidden md:block text-center mt-2 font-sans">
                    <span className="block font-bold text-[10px] text-stone-400 uppercase tracking-widest">{slotLabels[index].title}</span>
                  </div>
                </div>
              );
            })}

          </div>
        </section>

        {/* Buttons Control Panel */}
        <div className="w-full flex flex-col sm:flex-row items-center justify-center gap-4 pt-6 border-t border-[#d4d1cc] mt-4">
          <button
            onClick={() => setShowHelpModal(true)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded border border-stone-300 hover:border-stone-400 text-xs uppercase tracking-wider font-bold text-stone-700 bg-white hover:bg-stone-50 transition-all cursor-pointer shadow-sm active:scale-98 font-sans"
          >
            <Info className="w-3.5 h-3.5 text-stone-400" />
            <span>玩法說明</span>
          </button>

          <button
            onClick={resetGame}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded border border-stone-300 hover:border-stone-400 text-xs uppercase tracking-wider font-bold text-stone-700 bg-white hover:bg-stone-50 transition-all cursor-pointer shadow-sm active:scale-98 font-sans"
          >
            <RotateCcw className="w-3.5 h-3.5 text-stone-400" />
            <span>重置與洗牌</span>
          </button>

          <button
            onClick={handleCheckAnswer}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-12 py-3 bg-[#4a3f35] text-[#f5f2ed] rounded font-sans uppercase tracking-[0.2em] text-xs font-bold hover:bg-[#5a4f45] transition-all shadow-lg shadow-[#4a3f35]/20 cursor-pointer active:scale-98"
          >
            <Check className="w-3.5 h-3.5 text-amber-300" />
            <span>檢查答案</span>
          </button>
        </div>

        {/* Leaderboard Section */}
        <section className="w-full mt-4 p-6 bg-white/60 rounded-lg border border-stone-200 shadow-xs font-sans">
          <div className="flex flex-wrap items-center gap-2 mb-4 border-b border-stone-200 pb-3">
            <Trophy className="w-4 h-4 text-amber-700 animate-bounce" />
            <h3 className="text-sm font-serif font-bold tracking-widest text-stone-800 uppercase">
              歷史名人堂 (排行榜)
            </h3>
            <span className="text-[10px] text-stone-400 tracking-widest ml-auto uppercase font-bold">
              依最快完成時間排序
            </span>
          </div>

          {leaderboard.length === 0 ? (
            <div className="py-6 text-center text-xs text-stone-400 italic font-serif">
              目前尚無紀錄，成為第一個登陸歷史名人堂的學者吧！
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-stone-600">
                <thead>
                  <tr className="border-b border-stone-100 text-stone-400 font-bold uppercase tracking-widest text-[9px]">
                    <th className="py-2 w-16">名次</th>
                    <th className="py-2">挑戰者</th>
                    <th className="py-2 text-right">花費時間</th>
                    <th className="py-2 text-right hidden sm:table-cell">挑戰日期</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {leaderboard.map((entry, idx) => {
                    return (
                      <tr key={entry.id} className="hover:bg-stone-50/50 transition-colors">
                        <td className="py-2.5 font-bold">
                          {idx === 0 ? '🏆 1' : idx === 1 ? '🥈 2' : idx === 2 ? '🥉 3' : `${idx + 1}`}
                        </td>
                        <td className="py-2.5 font-serif font-medium text-stone-800">
                          {entry.name}
                        </td>
                        <td className="py-2.5 text-right font-mono font-bold text-stone-800">
                          {formatTime(entry.timeInSeconds)}
                        </td>
                        <td className="py-2.5 text-right text-stone-400 text-[10px] hidden sm:table-cell">
                          {entry.date}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </div>

      {/* FOOTER */}
      <footer className="w-full py-6 text-center border-t border-[#d4d1cc] text-[10px] font-sans text-stone-400 uppercase tracking-wider">
        <p>© 台灣歷史學堂 · 歷史序位互動挑戰</p>
      </footer>

      {/* MODALS SECTION */}
      <AnimatePresence>
        {/* Help Description Modal */}
        {showHelpModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHelpModal(false)}
              className="absolute inset-0 bg-stone-900/40 backdrop-blur-xs"
            ></motion.div>
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-lg shadow-2xl border border-stone-200 w-full max-w-md p-6 z-10 relative overflow-hidden text-left"
            >
              {/* Top border decor */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-[#4a3f35]"></div>
              
              <div className="flex items-center justify-between mb-4 mt-2">
                <h3 className="text-lg font-serif font-bold text-stone-900 flex items-center gap-2">
                  <HelpCircle className="w-5 h-5 text-stone-600" />
                  挑戰玩法指引
                </h3>
                <button 
                  onClick={() => setShowHelpModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4 text-stone-600 text-sm leading-relaxed font-sans">
                <p>
                  歡迎進入本歷史挑戰，這是一個考驗你對台灣歷史轉折點理解的排序遊戲。
                </p>
                
                <div className="space-y-2">
                  <h4 className="font-serif font-bold text-stone-800">🎮 拖曳或點選操作：</h4>
                  <ul className="list-decimal list-inside pl-1 space-y-1.5 text-xs text-stone-500">
                    <li>
                      <strong className="text-stone-700 font-serif">滑鼠/觸控拖曳：</strong>
                      拖曳上方事件卡片至下方時間軸的空槽中。
                    </li>
                    <li>
                      <strong className="text-stone-700 font-serif">直接點擊快速放置：</strong>
                      直接點選上方卡片，將會由左至右自動依序補齊空缺。點擊已在時間軸中的卡片亦可收回。
                    </li>
                  </ul>
                </div>

                <div className="space-y-2">
                  <h4 className="font-serif font-bold text-stone-800">📌 通關檢驗：</h4>
                  <p className="text-xs text-stone-500">
                    將荷蘭人建城、鄭成功登台、清領時期、日治時期依歷史發展進程正確排序，點擊「檢查答案」即完成。
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowHelpModal(false)}
                className="w-full mt-6 py-3 bg-[#4a3f35] text-[#f5f2ed] rounded font-sans uppercase tracking-widest text-xs font-bold hover:bg-[#5a4f45] transition-all cursor-pointer"
              >
                進入挑戰
              </button>
            </motion.div>
          </div>
        )}

        {/* ERROR RESULT MODAL (Friendly feedback) */}
        {showErrorModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowErrorModal(false)}
              className="absolute inset-0 bg-stone-900/40 backdrop-blur-xs"
            ></motion.div>
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-lg shadow-2xl border border-stone-200 w-full max-w-md p-8 z-10 relative overflow-hidden text-center"
            >
              {/* Top border decor */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-stone-500"></div>

              {/* Icon warning */}
              <div className="mx-auto w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center text-stone-600 mb-4 mt-2">
                <HelpCircle className="w-6 h-6" />
              </div>

              <h3 className="text-xl font-serif font-bold text-stone-900 mb-2">
                順序還有點不對喔，再試試看！
              </h3>
              
              <p className="text-sm text-stone-500 font-sans leading-relaxed mb-6">
                歷史事件的流動自有其次序，可以再思考一下每個時期的背景。
              </p>

              {/* Progress and hints */}
              <div className="bg-stone-50 rounded-lg p-4 text-left border border-stone-200 mb-6 font-sans">
                <h4 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-3 text-center">
                  目前排列定位檢視
                </h4>
                
                {/* Visual dots feedback */}
                <div className="flex justify-around items-center gap-2 mb-4 px-2">
                  {slots.map((id, index) => {
                    const isSlotCorrect = id === CORRECT_ORDER[index];
                    return (
                      <div key={index} className="flex flex-col items-center gap-1">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-serif font-bold ${
                          isSlotCorrect 
                            ? 'bg-stone-800 text-stone-100' 
                            : 'bg-stone-200 text-stone-500'
                        }`}>
                          {index + 1}
                        </div>
                        <span className="text-[10px] text-stone-400">
                          {isSlotCorrect ? '正確' : '需調整'}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="text-xs text-stone-500 space-y-1.5 leading-relaxed pt-3 border-t border-stone-200">
                  <p className="font-bold text-stone-700 flex items-center gap-1 font-serif">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-stone-500"></span>
                    歷史大事提示：
                  </p>
                  <p>
                    • 台灣的殖民歷史起源於大航海時代的「荷蘭人」建城。<br />
                    • 隨後鄭成功渡海擊敗荷軍，台灣政權正式輪替。<br />
                    • 「馬關條約」割讓台灣，是清領時期之後、日治時期之始。
                  </p>
                </div>
              </div>

              <div className="flex gap-3 font-sans">
                <button
                  onClick={resetGame}
                  className="w-1/3 py-2.5 border border-stone-300 hover:bg-stone-50 rounded text-xs uppercase tracking-wider font-bold text-stone-600 transition-all cursor-pointer"
                >
                  重新洗牌
                </button>
                <button
                  onClick={() => setShowErrorModal(false)}
                  className="w-2/3 py-2.5 bg-[#4a3f35] hover:bg-[#5a4f45] text-[#f5f2ed] rounded text-xs uppercase tracking-wider font-bold transition-all cursor-pointer"
                >
                  返回嘗試
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* SUCCESS VICTORY MODAL (Timeline summaries) */}
        {showSuccessModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSuccessModal(false)}
              className="absolute inset-0 bg-stone-900/40 backdrop-blur-xs"
            ></motion.div>
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-lg shadow-2xl border border-stone-200 w-full max-w-xl p-6 md:p-8 z-10 relative overflow-hidden text-left my-8"
            >
              {/* Top golden border decor */}
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#4a3f35]"></div>

              {/* Close Button */}
              <button 
                onClick={() => setShowSuccessModal(false)}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="text-center mb-6 mt-4">
                <div className="mx-auto w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center text-stone-700 mb-3 animate-bounce">
                  <Trophy className="w-6 h-6" />
                </div>
                <h3 className="text-2xl font-serif font-bold text-stone-900 tracking-wide">
                  歷史博學家！
                </h3>
                <p className="text-[10px] uppercase tracking-widest font-sans text-stone-400 mt-1">
                  恭喜你！這四個關鍵的歷史轉折點你都排列得非常完美。
                </p>
              </div>

              {/* Complete chronologial table review */}
              <div className="bg-stone-50 border border-stone-200 rounded-lg p-4 md:p-6 mb-6">
                <h4 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-4 text-center">
                  台灣關鍵歷史事件時間軸回顧
                </h4>

                <div className="space-y-6 relative pl-4 border-l border-stone-300">
                  {CORRECT_ORDER.map((id, index) => {
                    const event = getEventById(id);
                    if (!event) return null;
                    const Icon = event.icon;

                    return (
                      <div key={id} className="relative group">
                        {/* Bullet circle with icon inside */}
                        <div className="absolute -left-[25px] top-0.5 w-4 h-4 rounded-full bg-white border border-stone-500 flex items-center justify-center z-10 font-sans">
                          <Icon className="w-2.5 h-2.5 text-stone-700" />
                        </div>

                        <div>
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="font-mono font-black text-xs text-stone-800">
                              {event.year} 年
                            </span>
                            <span className="inline-block text-[9px] font-sans uppercase tracking-wider text-amber-800 font-bold bg-stone-100 px-1.5 py-0.2 rounded">
                              {event.era}
                            </span>
                          </div>
                          <h5 className="font-serif font-bold text-sm text-stone-900 mb-1">
                            {event.title}
                          </h5>
                          <p className="text-xs text-stone-500 font-sans leading-relaxed">
                            {event.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Score Submission */}
              <div className="border-t border-b border-stone-200 py-4 my-6 font-sans">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-stone-600 animate-pulse" />
                  <span className="text-xs font-serif font-bold text-stone-800">您的通關時間：</span>
                  <span className="font-mono text-sm font-bold bg-stone-100 px-2.5 py-0.5 rounded text-[#4a3f35] border border-stone-200">
                    {formatTime(elapsedTime)}
                  </span>
                </div>

                {!hasSubmitted ? (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      maxLength={10}
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value)}
                      placeholder="請輸入您的姓名登榜..."
                      className="flex-grow px-3 py-2 border border-stone-300 rounded text-xs bg-stone-50 hover:border-stone-400 focus:outline-none focus:ring-1 focus:ring-[#4a3f35] focus:border-[#4a3f35] font-serif"
                    />
                    <button
                      onClick={() => saveLeaderboardEntry(playerName)}
                      className="px-4 py-2 bg-[#4a3f35] text-[#f5f2ed] rounded text-xs font-bold uppercase tracking-wider hover:bg-[#5a4f45] transition-all cursor-pointer whitespace-nowrap active:scale-98"
                    >
                      登錄排行榜
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 p-2.5 rounded">
                    <Check className="w-4 h-4 flex-shrink-0" />
                    <span>已成功登錄名人堂！快去下方排行榜看看您的名次吧！</span>
                  </div>
                )}
              </div>

              <div className="flex gap-4 font-sans">
                <button
                  onClick={() => {
                    setShowSuccessModal(false);
                    triggerConfetti();
                  }}
                  className="w-1/3 py-2.5 border border-stone-300 hover:bg-stone-50 rounded text-xs uppercase tracking-wider font-bold text-stone-600 transition-all cursor-pointer"
                >
                  施放彩帶慶祝
                </button>
                <button
                  onClick={resetGame}
                  className="w-2/3 py-2.5 bg-[#4a3f35] text-[#f5f2ed] rounded text-xs uppercase tracking-wider font-bold hover:bg-[#5a4f45] transition-all cursor-pointer text-center"
                >
                  再挑戰一次
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

