import { Spinner } from '@/components/ui/spinner';
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
	Film,
	CheckCircle2,
	FileText,
	AlertCircle,
	Clapperboard,
	FolderOpen,
	RefreshCw,
	Volume2,
} from "lucide-react";
import { VideoPlayer } from "./VideoPlayer";
import { useProcessContext } from "@/stores/ProcessStore";
import { matchesProjectId } from "@/lib/BrowserPathUtils";

interface VideoProgress {
	status:
	| "preparing"
	| "processing"
	| "concatenating"
	| "rerendering"
	| "done"
	| "error";
	progress: number;
	detail: string;
	current?: number;
	total?: number;
}

export const CreateFinalVideoPhase = ({ onComplete }: { onComplete?: () => void }) => {
	const { id } = useParams();
	const [phase, setPhase] = useState<"loading" | "no-data" | "ready" | "error">(
		"loading",
	);
	const [projectPath, setProjectPath] = useState("");
	const [isProcessing, setIsProcessing] = useState(false);
	const [progress, setProgress] = useState<VideoProgress | null>(null);
	const [outputPath, setOutputPath] = useState<string | null>(null);
	const [hasExistingFinal, setHasExistingFinal] = useState(false);
	const [missingItem, setMissingItem] = useState("");
	const [encoderType, setEncoderType] = useState<'gpu' | 'cpu' | null>(null);

	const { setIsProcessing: setGlobalProcessing } = useProcessContext();

	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		setGlobalProcessing(isProcessing);
	}, [isProcessing, setGlobalProcessing]);

	useEffect(() => {
		const init = async () => {
			try {
				setPhase("loading");
				setError(null);
				
				const projects = await window.api.getProjects();
				const project = projects.find((p: any) => matchesProjectId(p, id));
				if (!project) {
					console.error("[CreateFinalVideoPhase] Project not found for ID:", id);
					setPhase("error");
					return;
				}
				setProjectPath(project.path);

				const checkResult = await window.api.checkFinalVideoReady(
					project.path,
				);
				if (!checkResult.ready) {
					setMissingItem(checkResult.missing || "");
					setPhase("no-data");
					return;
				}

				if (checkResult.existingFinal) {
					setOutputPath(checkResult.existingFinal);
					setHasExistingFinal(true);
				}

				setPhase("ready");
			} catch (err: any) {
				console.error("[CreateFinalVideoPhase] Init failed:", err);
				setError(err.message || "Đã xảy ra lỗi khi chuẩn bị video thành phẩm");
				setPhase("error");
			}
		};

		if (id) {
			init();
		}
	}, [id]);

	useEffect(() => {
		window.api.onFinalVideoProgress((progressData: VideoProgress) => {
			setProgress(progressData);

			// Parse encoder type from detail message
			if (progressData.detail?.includes('GPU') || progressData.detail?.includes('🚀')) {
				setEncoderType('gpu');
			} else if (progressData.detail?.includes('CPU') || progressData.detail?.includes('⚙️')) {
				setEncoderType('cpu');
			}

			if (progressData.status === "done") {
				setIsProcessing(false);
				setHasExistingFinal(true);
				window.api
					.checkFinalVideoReady(projectPath)
					.then((r: { existingFinal?: string | null }) => {
						if (r.existingFinal) {
							setOutputPath(r.existingFinal);
						}
					});
			} else if (progressData.status === "error") {
				setIsProcessing(false);
			}
		});

		return () => {
			window.api.removeFinalVideoListeners();
		};
	}, [projectPath, onComplete]);


	const [backgroundVolume, setBackgroundVolume] = useState(10);
	const volumeSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Tải giá trị âm lượng mặc định từ config khi khởi tạo
	useEffect(() => {
		window.api.getDefaultBackgroundVolume().then((vol) => {
			setBackgroundVolume(vol);
		});
	}, []);

	// Hàm thay đổi âm lượng + auto-save với debounce
	const handleVolumeChange = useCallback((newVolume: number) => {
		setBackgroundVolume(newVolume);
		// Debounce lưu vào config (500ms)
		if (volumeSaveTimerRef.current) {
			clearTimeout(volumeSaveTimerRef.current);
		}
		volumeSaveTimerRef.current = setTimeout(() => {
			window.api.setDefaultBackgroundVolume(newVolume);
		}, 500);
	}, []);

	// Cleanup timer khi unmount
	useEffect(() => {
		return () => {
			if (volumeSaveTimerRef.current) {
				clearTimeout(volumeSaveTimerRef.current);
			}
		};
	}, []);

	const handleStartCreate = () => {
		if (!projectPath) return;
		setIsProcessing(true);
		setProgress(null);
		setOutputPath(null);
		window.api.createFinalVideo(projectPath, { 
			backgroundVolume: backgroundVolume / 100
		});
	};

	const handleCancelCreate = () => {
		window.api.cancelFinalVideo();
	};

	const handleOpenFolder = () => {
		if (outputPath) {
			window.api.openInExplorer(outputPath);
		}
	};

	if (phase === "loading") {
		return (
			<div className="flex flex-col items-center justify-center h-full gap-4">
				<Spinner className="w-8 h-8 animate-spin text-primary" />
				<span className="text-sm text-muted-foreground animate-pulse">Đang chuẩn bị video...</span>
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
						{error || "Không thể tải dữ liệu video hoặc dự án đã bị lỗi."}
					</p>
				</div>
				<Button variant="outline" onClick={() => window.location.href = '/'}>
					Quay lại Trang chủ
				</Button>
			</div>
		);
	}

	if (phase === "no-data") {
		return (
			<div className='flex flex-col items-center justify-center h-full p-4'>
				<div className='text-center space-y-4 animate-in fade-in duration-300'>
					<FileText className='w-16 h-16 text-muted-foreground/30 mx-auto' />
					<h2 className='text-xl font-bold'>Chưa đủ dữ liệu</h2>
					<p className='text-sm text-muted-foreground'>
						{missingItem ||
							"Cần có video gốc, phụ đề gốc và audio đã tạo để ghép video final."}
					</p>
					<Button variant="outline" onClick={() => window.location.href = '/'}>
						Quay lại Trang chủ
					</Button>
				</div>
			</div>
		);
	}

	const statusIcon = () => {
		if (!progress) return <Film className='w-5 h-5 text-primary' />;
		switch (progress.status) {
			case "preparing":
				return (
					<Spinner className='w-5 h-5 text-primary animate-spin' />
				);
			case "processing":
				return (
					<Clapperboard className='w-5 h-5 text-primary animate-pulse' />
				);
			case "concatenating":
				return <Film className='w-5 h-5 text-primary animate-pulse' />;
			case "rerendering":
				return (
					<RefreshCw className='w-5 h-5 text-primary animate-spin' />
				);
			case "done":
				return <CheckCircle2 className='w-5 h-5 text-green-500' />;
			case "error":
				return <AlertCircle className='w-5 h-5 text-destructive' />;
		}
	};

	if (isProcessing) {
		return (
			<div className='flex flex-col items-center justify-center p-4 gap-6 max-w-4xl w-full mx-auto h-full'>
				{ }
				<div className='w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center'>
					<Clapperboard className='w-10 h-10 text-primary animate-pulse' />
				</div>

				{ }
				<div className='text-center space-y-2'>
					<h2 className='text-xl font-bold'>
						Đang tạo Video Thành phẩm...
					</h2>
					<p className='text-sm text-muted-foreground'>
						{progress?.detail || "Đang chuẩn bị..."}
					</p>
					{encoderType && (
						<div className="flex items-center justify-center gap-2 mt-2">
							{encoderType === 'gpu' ? (
								<span className="px-3 py-1 bg-green-500/10 text-green-500 rounded-md font-semibold text-xs flex items-center gap-1">
									🚀 GPU Accelerated
								</span>
							) : (
								<span className="px-3 py-1 bg-yellow-500/10 text-yellow-500 rounded-md font-semibold text-xs flex items-center gap-1">
									⚙️ CPU Encoding
								</span>
							)}
						</div>
					)}
				</div>

				{ }
				{progress && (
					<div className='w-full max-w-md space-y-2'>
						<div className='flex items-center gap-2'>
							{statusIcon()}
							<span className='text-sm font-medium'>
								{progress.detail}
							</span>
						</div>
						<Progress
							value={progress.progress}
							className='w-full h-2'
						/>
						{progress.current !== undefined &&
							progress.total !== undefined && (
								<p className='text-xs text-muted-foreground text-center'>
									{progress.current} / {progress.total} phân đoạn
								</p>
							)}
					</div>
				)}

				{ }
				{progress?.status === "error" && (
					<div className='w-full max-w-md bg-destructive/10 border border-destructive/20 rounded-xl p-4'>
						<div className='flex items-center gap-2 text-sm text-destructive'>
							<AlertCircle className='w-4 h-4 shrink-0' />
							<span>{progress.detail}</span>
						</div>
					</div>
				)}

				<Button variant="destructive" className="mt-4 gap-2" onClick={handleCancelCreate} disabled={progress?.status === 'done' || progress?.status === 'error'}>
					<AlertCircle className="w-4 h-4" />
					Dừng khẩn cấp
				</Button>
			</div>
		);
	}

	const volumeSlider = (
		<div className="w-full space-y-4 p-4 bg-muted/30 rounded-xl border border-border/40 shadow-sm">
			<div className="space-y-2.5">
				<div className="flex justify-between items-center">
					<label className="text-xs font-semibold text-foreground/70 flex items-center gap-2">
						<Volume2 className="w-3.5 h-3.5 text-primary/80" />
						Âm lượng nền (Background & Gap)
					</label>
					<span className="text-[11px] font-bold font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-md border border-primary/20">
						{backgroundVolume}%
					</span>
				</div>
				<input 
					type="range" 
					min="0" 
					max="100" 
					step="1"
					value={backgroundVolume}
					onChange={(e) => handleVolumeChange(parseInt(e.target.value))}
					className="w-full h-1 bg-secondary rounded-full appearance-none cursor-pointer accent-primary"
				/>
			</div>

			<p className="text-[10px] text-muted-foreground/50 italic text-center border-t border-border/10 pt-2">
				* Âm lượng nền áp dụng cho cả phần background audio (khi có lồng tiếng) và phần gap (giữa các câu).
			</p>
		</div>
	);

	if (!hasExistingFinal) {
		return (
			<div className='flex flex-col items-center justify-center p-4 gap-6 max-w-lg w-full mx-auto h-full'>
				{ }
				<div className='w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center'>
					<Film className='w-10 h-10 text-primary' />
				</div>

				{ }
				<div className='text-center space-y-2'>
					<h2 className='text-xl font-bold'>Tạo Video Thành phẩm</h2>
					<p className='text-sm text-muted-foreground'>
						Ghép video gốc với âm thanh đã tạo, giữ nguyên chất lượng video gốc.
					</p>
				</div>

				{ }
				{volumeSlider}

				<Button className='w-full h-12 shadow-md gap-2 text-base font-semibold' onClick={handleStartCreate}>
					<Film className='w-5 h-5' />
					Bắt đầu Tạo
				</Button>
			</div>
		);
	}

	return (
		<div className='flex flex-col items-center justify-center p-4 gap-4 max-w-4xl w-full mx-auto h-full overflow-y-auto'>

			{ }
			<div className='w-full bg-background rounded-xl overflow-hidden shadow-sm border border-border'>
				<div className='aspect-video relative'>
					{outputPath && <VideoPlayer src={outputPath} />}
				</div>
			</div>

			<div className='w-full space-y-3'>
				{volumeSlider}

				<div className='w-full bg-background rounded-xl overflow-hidden shadow-sm border border-border p-3 space-y-2'>
					{ }
					<div className='space-y-2'>
						<p className='text-xs text-muted-foreground font-semibold uppercase tracking-wide'>
							Đường dẫn Video
						</p>
						<p
							className='text-xs text-muted-foreground font-mono truncate break-words'
							title={outputPath || ""}
						>
							{outputPath || ""}
						</p>
					</div>

					{ }
					<div className='flex gap-2 pt-2'>
						<Button
							variant='secondary'
							className='gap-2 flex-1'
							onClick={handleOpenFolder}
						>
							<FolderOpen className='w-4 h-4' />
							Mở thư mục
						</Button>
						<Button
							variant='outline'
							className='gap-2 flex-1'
							onClick={handleStartCreate}
						>
							<RefreshCw className='w-4 h-4' />
							Tạo lại
						</Button>
						{onComplete && (
							<Button
								className='gap-2 flex-1 shadow-sm'
								onClick={onComplete}
							>
								<CheckCircle2 className='w-4 h-4' />
								Hoàn tất
							</Button>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};
