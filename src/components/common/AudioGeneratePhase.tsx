import { Spinner } from '@/components/ui/spinner';
import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { VoiceSelector } from './VoiceSelector';
import { VoiceModal } from './VoiceModal';
import { getPresetsForLanguage } from '@/services/tts/VoiceCatalog';
import { AudioPlaybackService } from '@/services/AudioPlaybackService';
import {
    Volume2,
    CheckCircle2,
    Play,
    FileText,
    AlertCircle,
    Music,
    Square,
    RefreshCw,
    ArrowRight
} from "lucide-react";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { parseSrt, TARGET_LANGUAGES, type SrtEntry } from "@/lib/utils";
import { useProcessContext } from "@/stores/ProcessStore";
import ReactCountryFlag from "react-country-flag";
import { matchesProjectId } from "@/lib/BrowserPathUtils";

interface AudioProgress {
    status: 'generating' | 'done' | 'error';
    progress: number;
    detail: string;
    current?: number;
    total?: number;
    entryIndex?: number;
    entryStatus?: 'start' | 'done' | 'failed';
}

interface EntryState {
    status: EntryAudioStatus;
    attempts: number;
    lastError?: string;
}

type EntryAudioStatus = 'pending' | 'generating' | 'done' | 'failed';

export const AudioGeneratePhase = ({ onComplete }: { onComplete?: () => void }) => {
    const { id } = useParams();
    const [phase, setPhase] = useState<"loading" | "no-translation" | "ready" | "error">("loading");
    const [projectPath, setProjectPath] = useState("");
    const [translatedEntries, setTranslatedEntries] = useState<SrtEntry[]>([]);
    const [translatedLang, setTranslatedLang] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);
    const [progress, setProgress] = useState<AudioProgress | null>(null);
    const [audioFiles, setAudioFiles] = useState<{ name: string; path: string }[]>([]);
    const [entryStatuses, setEntryStatuses] = useState<Map<number, EntryState>>(new Map());

const getEntryState = (index: number): EntryState => entryStatuses.get(index) || { status: 'pending', attempts: 0 };
    const [playingIndex, setPlayingIndex] = useState<number | null>(null);
    const playbackRef = useRef(new AudioPlaybackService());

    const { setIsProcessing: setGlobalProcessing } = useProcessContext();

    const retryCountRef = useRef(0);

    const [error, setError] = useState<string | null>(null);
    const [selectedVoiceId, setSelectedVoiceId] = useState<string>('');

    const handleVoiceChange = (voiceId: string) => {
        setSelectedVoiceId(voiceId);
        if (projectPath && translatedLang) {
            window.api.setVoicePreference(projectPath, translatedLang, voiceId);
        }
    };
    const [showVoiceModal, setShowVoiceModal] = useState(false);
    const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
    const [concurrency, setConcurrency] = useState(10);
    const previewAudioRef = useRef<HTMLAudioElement[]>([]);

    useEffect(() => {
        setGlobalProcessing(isGenerating);
    }, [isGenerating, setGlobalProcessing]);

    useEffect(() => {
        const init = async () => {
            try {
                setPhase("loading");
                setError(null);

                const projects = await window.api.getProjects();
                const project = projects.find((p: any) => matchesProjectId(p, id));
                if (!project) {
                    console.error("[AudioGeneratePhase] Project not found for ID:", id);
                    setPhase("error");
                    return;
                }
                setProjectPath(project.path);

                const langs = ["vi", "zh", "ja", "ko", "fr", "de", "es", "pt", "ru", "en", "th"];
                let foundLang = "";
                let foundContent = "";

                for (const lang of langs) {
                    const content = await window.api.getTranslatedSrt(project.path, lang);
                    if (content) {
                        foundLang = lang;
                        foundContent = content;
                        break;
                    }
                }

                if (foundContent && foundLang) {
                    const entries = parseSrt(foundContent);
                    setTranslatedEntries(entries);
                    setTranslatedLang(foundLang);

                    const savedVoiceId = await window.api.getVoicePreference(project.path, foundLang);
                    const presets = getPresetsForLanguage(foundLang);
                    if (savedVoiceId && presets.some(p => p.id === savedVoiceId)) {
                        setSelectedVoiceId(savedVoiceId);
                    } else if (presets.length > 0) {
                        setSelectedVoiceId(presets[0].id);
                    }

                    const savedConcurrency = await window.api.getConcurrencySettings(project.path);
                    if (savedConcurrency?.initial) {
                        setConcurrency(savedConcurrency.initial);
                    }

                    const existingAudio = await window.api.listGeneratedAudio(project.path);
                    if (existingAudio && existingAudio.length > 0) {
                        setAudioFiles(existingAudio);
                        const statuses = new Map<number, EntryState>();
                        entries.forEach(entry => {
                            const baseName = `${String(entry.index).padStart(4, '0')}`;
                            const hasAudio = existingAudio.some((f: { name: string }) =>
                                f.name === `${baseName}.mp3` || f.name === `${baseName}.wav`
                            );
                            statuses.set(entry.index, { status: hasAudio ? 'done' : 'pending', attempts: 0 });
                        });
                        setEntryStatuses(statuses);
                    }
                    setPhase("ready");
                } else {
                    setPhase("no-translation");
                }
            } catch (err: any) {
                console.error("[AudioGeneratePhase] Init failed:", err);
                setError(err.message || "Đã xảy ra lỗi khi tải dữ liệu âm thanh");
                setPhase("error");
            }
        };

        if (id) {
            init();
        }
    }, [id]);

    useEffect(() => {
        window.api.onAudioGenerateProgress((progressData: AudioProgress) => {
            setProgress(progressData);

            if (progressData.entryIndex !== undefined && progressData.entryStatus) {
                setEntryStatuses(prev => {
                    const next = new Map(prev);
                    const prevState = next.get(progressData.entryIndex!) || { status: 'pending', attempts: 0 };
                    if (progressData.entryStatus === 'start') {
                        next.set(progressData.entryIndex!, { status: 'generating', attempts: prevState.attempts + 1, lastError: undefined });
                    } else if (progressData.entryStatus === 'done') {
                        next.set(progressData.entryIndex!, { status: 'done', attempts: prevState.attempts, lastError: undefined });
                    } else if (progressData.entryStatus === 'failed') {
                        next.set(progressData.entryIndex!, { status: 'failed', attempts: prevState.attempts, lastError: progressData.detail });
                    }
                    return next;
                });
            }

            if (progressData.status === 'done') {
                setIsGenerating(false);
                if (projectPath) {
                    window.api.listGeneratedAudio(projectPath).then(files => {
                        setAudioFiles(files);
                    });
                }
            } else if (progressData.status === 'error') {
                setIsGenerating(false);
            }
        });

        return () => {
            window.api.removeAudioGenerateListeners();
        };
    }, [projectPath, onComplete]);


    const handleStartGenerate = () => {
        if (!projectPath || !translatedLang) return;
        setIsGenerating(true);
        retryCountRef.current = 0;
        setProgress(null);
        const statuses = new Map<number, EntryState>();
        translatedEntries.forEach(entry => {
            statuses.set(entry.index, { status: 'pending', attempts: 0 });
        });
        setEntryStatuses(statuses);
        setAudioFiles([]);
        window.api.generateAudio(projectPath, translatedLang, selectedVoiceId);
    };

    const processRetryQueue = async (indices: number[]) => {
        setIsGenerating(true);
        for (const idx of indices) {
            await window.api.generateSingleAudio(projectPath, translatedLang, idx, selectedVoiceId);
        }
    };

    const handleRetryGenerateItem = async (index: number) => {
        if (!projectPath || !translatedLang || isGenerating) return;
        setIsGenerating(true);
        await window.api.generateSingleAudio(projectPath, translatedLang, index, selectedVoiceId);
    };

    const handlePlayAudio = async (index: number, audioPath: string) => {
        const playback = playbackRef.current;

        if (playback.isPlaying && playingIndex === index) {
            playback.stop();
            setPlayingIndex(null);
            return;
        }

        playback.stop();
        setPlayingIndex(index);
        try {
            const dataUrl = await window.api.readGeneratedAudio(audioPath);
            if (!dataUrl) {
                setPlayingIndex(null);
                return;
            }
            await playback.play(dataUrl);
            setPlayingIndex(null);
        } catch {
            setPlayingIndex(null);
        }
    };



    const handlePreviewVoice = async (voiceId: string) => {
        if (!projectPath || !translatedLang || isPreviewPlaying) return;
        setIsPreviewPlaying(true);

        try {
            const response = await window.api.generateVoicePreview(projectPath, translatedLang, voiceId);
            if (response.error) {
                console.error('Preview failed:', response.error);
                return;
            }

            const { samples } = response.result;
            for (let i = 0; i < samples.length; i++) {
                const sample = samples[i];
                const dataUrl = await window.api.readGeneratedAudio(sample.audioPath);
                if (dataUrl) {
                    await new Promise<void>((resolve) => {
                        const audio = new Audio(dataUrl);
                        previewAudioRef.current[i] = audio;
                        audio.onended = () => setTimeout(resolve, 500);
                        audio.onerror = () => resolve();
                        audio.play().catch(() => resolve());
                    });
                }
            }
        } catch (err) {
            console.error('Preview playback failed:', err);
        } finally {
            setIsPreviewPlaying(false);
        }
    };

    const hasAnyAudio = audioFiles.length > 0;
    const doneCount = Array.from(entryStatuses.values()).filter(s => s.status === 'done').length;
    const failedCount = Array.from(entryStatuses.values()).filter(s => s.status === 'failed').length;

    if (phase === "loading") {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4">
                <Spinner className="w-8 h-8 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground animate-pulse">Đang nạp dữ liệu âm thanh...</span>
            </div>
        );
    }

    if (phase === "error") {
        return (
            <div className="flex flex-col items-center justify-center h-full p-4 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
                    <AlertCircle className="w-8 h-8" />
                </div>
                <div className="space-y-1">
                    <h2 className="text-xl font-bold">Lỗi khởi tạo</h2>
                    <p className="text-sm text-muted-foreground max-w-sm">
                        {error || "Không thể tìm thấy hoặc tải dữ liệu dự án."}
                    </p>
                </div>
                <Button variant="outline" onClick={() => window.location.href = '/'}>
                    Quay lại Trang chủ
                </Button>
            </div>
        );
    }

    if (phase === "no-translation") {
        return (
            <div className="flex flex-col items-center justify-center h-full p-4">
                <div className="text-center space-y-4 animate-in fade-in duration-300">
                    <FileText className="w-16 h-16 text-muted-foreground/30 mx-auto" />
                    <h2 className="text-xl font-bold">Không tìm thấy Bản dịch</h2>
                    <p className="text-sm text-muted-foreground">
                        Vui lòng dịch phụ đề trước khi tạo âm thanh. Quay lại tab "Phiên dịch" để bắt đầu.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <TooltipProvider>
            <div className="flex flex-col p-4 gap-4 max-w-7xl w-full mx-auto h-full overflow-hidden min-h-[400px]">
                <div className="flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <Volume2 className="w-5 h-5 text-primary" />
                        <div>
                            <h2 className="text-lg font-bold">Tạo Âm thanh - Edge TTS</h2>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                                {translatedEntries.length} phân đoạn •
                                {(() => {
                                    const langItem = TARGET_LANGUAGES.find(l => l.code === translatedLang);
                                    return langItem ? (
                                        <span className="flex items-center gap-1.5 ml-1">
                                            <ReactCountryFlag countryCode={langItem.flag} svg />
                                            {langItem.name}
                                        </span>
                                    ) : (
                                        <span>{translatedLang}</span>
                                    );
                                })()}
                                {doneCount > 0 && <span className="ml-1">• {doneCount} đã tạo</span>}
                                {failedCount > 0 && <span className="ml-1">• {failedCount} lỗi</span>}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <VoiceSelector
                            selectedVoiceId={selectedVoiceId}
                            language={translatedLang}
                            onVoiceChange={handleVoiceChange}
                            onShowAllVoices={() => setShowVoiceModal(true)}
                            onPreview={() => handlePreviewVoice(selectedVoiceId)}
                            disabled={isGenerating || isPreviewPlaying}
                        />
                        <Tooltip delayDuration={300}>
                            <TooltipTrigger asChild>
                                <div className="flex items-center gap-1.5 bg-muted/50 rounded-md px-2 py-1">
                                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">Luồng</span>
                                    <input
                                        type="range"
                                        min={1}
                                        max={20}
                                        value={concurrency}
                                        onChange={(e) => {
                                            const v = Number(e.target.value);
                                            setConcurrency(v);
                                            if (projectPath) {
                                                window.api.setConcurrencySettings(projectPath, { initial: v, min: 1, max: 20 });
                                            }
                                        }}
                                        disabled={isGenerating}
                                        className="w-16 h-3 accent-primary cursor-pointer"
                                    />
                                    <span className="text-[10px] font-mono w-4 text-right">{concurrency}</span>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">
                                <p>Số luồng tạo song song (1-20)</p>
                            </TooltipContent>
                        </Tooltip>
                        {isGenerating && progress ? (
                            <Button
                                size="sm"
                                variant="destructive"
                                className="gap-2"
                                onClick={() => {
                                    window.api.cancelAudioGeneration();
                                    setIsGenerating(false);
                                }}
                            >
                                <Square className="w-3.5 h-3.5" />
                                Hủy
                            </Button>
                        ) : (
                            <Button
                                size="sm"
                                variant={hasAnyAudio ? "outline" : "default"}
                                className="gap-2"
                                onClick={handleStartGenerate}
                                disabled={isGenerating}
                            >
                                {isGenerating ? (
                                    <>
                                        <Spinner className="w-3.5 h-3.5 animate-spin" />
                                        Đang tạo...
                                    </>
                                ) : (
                                    <>
                                        <Music className="w-3.5 h-3.5" />
                                        {hasAnyAudio ? "Tạo lại" : "Bắt đầu tạo"}
                                    </>
                                )}
                            </Button>
                        )}
                        {onComplete && hasAnyAudio && (
                            <Button size="sm" onClick={onComplete} className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm">
                                Tiếp tục
                                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                            </Button>
                        )}
                    </div>
                </div>

                {isGenerating && progress && (
                    <div className="shrink-0 space-y-1">
                        <Progress value={progress.progress} className="w-full h-2" />
                        <p className="text-xs text-muted-foreground text-center">
                            {progress.detail}
                        </p>
                    </div>
                )}

                {!isGenerating && failedCount > 0 && (
                    <div className="shrink-0">
                        <Button
                            size="sm"
                            variant="destructive"
                            className="gap-2 w-full"
                            onClick={async () => {
                                setIsGenerating(true);
                                const failedIndices = translatedEntries
                                    .map(e => e.index)
                                    .filter(idx => getEntryState(idx).status === 'failed');
                                await window.api.retryFailedAudio(projectPath, translatedLang, failedIndices, selectedVoiceId);
                            }}
                        >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Tạo lại {failedCount} đoạn lỗi
                        </Button>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto border rounded-xl">
                    <div className="divide-y">
                        {translatedEntries.map((entry, i) => {
                            const baseName = `${String(entry.index).padStart(4, '0')}`;
                            const audioFile = audioFiles.find(f =>
                                f.name === `${baseName}.mp3` || f.name === `${baseName}.wav`
                            );
                            const entryState = getEntryState(entry.index);
                            const status = entryState.status;
                            const isPlaying = playingIndex === i;

                            return (
                                <div
                                    key={entry.index}
                                    className={`flex items-center gap-3 p-3 transition-colors group ${status === 'generating'
                                        ? 'bg-primary/5 border-l-2 border-l-primary'
                                        : status === 'failed'
                                            ? 'bg-destructive/5 border-l-2 border-l-destructive'
                                            : 'hover:bg-muted/30'
                                        }`}
                                >

                                    <div className="shrink-0 w-8 h-8 flex items-center justify-center">
                                        {status === 'generating' ? (
                                            <Spinner className="w-4 h-4 animate-spin text-primary" />
                                        ) : status === 'done' && audioFile ? (
                                            <Button
                                                variant={isPlaying ? "default" : "ghost"}
                                                size="icon"
                                                className="w-8 h-8"
                                                onClick={() => handlePlayAudio(i, audioFile.path)}
                                            >
                                                {isPlaying ? (
                                                    <Square className="w-3 h-3" />
                                                ) : (
                                                    <Play className="w-4 h-4" />
                                                )}
                                            </Button>
                                        ) : status === 'failed' ? (
                                            <AlertCircle className="w-4 h-4 text-destructive" />
                                        ) : (
                                            <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/20" />
                                        )}
                                    </div>


                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-muted-foreground font-mono mb-0.5">
                                            #{entry.index} • {entry.startTime}
                                            {entryState.attempts > 1 && (
                                                <span className="ml-2 text-yellow-500 font-medium">({entryState.attempts} lần thử)</span>
                                            )}
                                        </p>
                                        <p className="text-sm truncate">{entry.text}</p>
                                        {status === 'failed' && entryState.lastError && (
                                            <p className="text-xs text-destructive mt-0.5 truncate" title={entryState.lastError}>
                                                {entryState.lastError}
                                            </p>
                                        )}
                                    </div>


                                    <div className="shrink-0 relative w-12 h-8 flex items-center justify-end">
                                        <div className="absolute inset-0 flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                            <Tooltip delayDuration={100}>
                                                <TooltipTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="w-8 h-8 hover:bg-muted cursor-pointer text-muted-foreground hover:text-foreground"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleRetryGenerateItem(entry.index);
                                                        }}
                                                        disabled={isGenerating || status === 'generating'}
                                                    >
                                                        <RefreshCw className={`w-4 h-4 ${isGenerating || status === 'generating' ? 'opacity-50' : ''}`} />
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent side="left">
                                                    <p>Tạo lại âm thanh</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </div>
                                        <div className="flex items-center justify-end w-full transition-opacity duration-200 opacity-100 group-hover:opacity-0">
                                            {status === 'done' && (
                                                <CheckCircle2 className="w-4 h-4 text-green-500" />
                                            )}
                                            {status === 'failed' && (
                                                <AlertCircle className="w-4 h-4 text-destructive" />
                                            )}
                                            {status === 'generating' && (
                                                <span className="text-xs text-primary font-medium">Đang tạo</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
            <VoiceModal
                    open={showVoiceModal}
                    selectedVoiceId={selectedVoiceId}
                    language={translatedLang}
                    onSelectVoice={handleVoiceChange}
                    onClose={() => setShowVoiceModal(false)}
                    onPreview={handlePreviewVoice}
                />
        </TooltipProvider>
    );
};
