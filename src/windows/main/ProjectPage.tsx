import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useParams, useNavigate } from "react-router-dom";
import { InputPhase } from "@/components/common/InputPhase";
import { TranscriptPhase } from "@/components/common/TranscriptPhase";
import { TranslatePhase } from "@/components/common/TranslatePhase";
import { AudioGeneratePhase } from "@/components/common/AudioGeneratePhase";
import { CreateFinalVideoPhase } from "@/components/common/CreateFinalVideoPhase";
import { Button } from "@/components/ui/button";

const PHASE_ORDER = ["download", "transcript", "translate", "audio", "final"] as const;

import { matchesProjectId } from "@/lib/BrowserPathUtils";

export const ProjectPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const currentPhase = searchParams.get("tab") || "download";
    const [projectPath, setProjectPath] = useState("");

    useEffect(() => {
        if (id) {
            window.api.getProjects().then((projects) => {
                const proj = projects.find((p: any) => matchesProjectId(p, id));
                if (proj) {
                    setProjectPath(proj.path);
                } else {
                     console.error("Project not found for ID:", id);
                }
            });
        }
    }, [id]);

    const markPhaseComplete = useCallback(async (phase: string) => {
        if (!projectPath) return;
        const meta = (await window.api.getProjectMetadata(projectPath)) || {};
        const completed: string[] = meta.completedPhases || [];
        if (!completed.includes(phase)) {
            completed.push(phase);
        }
        await window.api.saveProjectMetadata(projectPath, { completedPhases: completed });
    }, [projectPath]);

    const completeAndNavigate = useCallback((currentPhase: string, nextTab: string) => {
        markPhaseComplete(currentPhase);
        setSearchParams({ tab: nextTab });
    }, [markPhaseComplete, setSearchParams]);

    return (
        <div className="container mx-auto py-6 h-full flex flex-col">
            <div className="flex-1 flex flex-col items-center justify-center overflow-hidden">
                {currentPhase === "download" && (
                    <InputPhase onComplete={() => completeAndNavigate("download", "transcript")} />
                )}
                {currentPhase === "transcript" && (
                    <TranscriptPhase onComplete={() => completeAndNavigate("transcript", "translate")} />
                )}
                {currentPhase === "translate" && (
                    <TranslatePhase onComplete={() => completeAndNavigate("translate", "audio")} />
                )}
                {currentPhase === "audio" && (
                    <AudioGeneratePhase onComplete={() => completeAndNavigate("audio", "final")} />
                )}
                {currentPhase === "final" && (
                    <CreateFinalVideoPhase onComplete={() => completeAndNavigate("final", "download")} />
                )}

                {/* Fallback for invalid phase */}
                {!["download", "transcript", "translate", "audio", "final"].includes(currentPhase) && (
                    <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 pt-12">
                        <div className="p-4 bg-muted rounded-full">
                           <span className="text-4xl text-muted-foreground">?</span>
                        </div>
                        <div className="max-w-md">
                            <h2 className="text-xl font-bold">Lỗi Giao diện (Black Screen prevention)</h2>
                            <p className="text-muted-foreground text-sm mt-2">
                                Hệ thống vừa điều hướng đến tab "{currentPhase}" không hợp lệ. 
                                Điều này có thể xảy ra khi nhấn nút Back của trình duyệt/chuột quá nhanh.
                            </p>
                        </div>
                        <div className="flex gap-2">
                             <Button variant="outline" onClick={() => navigate("/")}>
                                Quay lại Trang chủ
                            </Button>
                            <Button onClick={() => setSearchParams({ tab: "download" })}>
                                Quay lại Bước 1
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
