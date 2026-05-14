import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
    getProjects: () => ipcRenderer.invoke('get-projects'),
    addProject: (project: any) => ipcRenderer.invoke('add-project', project),
    deleteProject: (id: string) => ipcRenderer.invoke('delete-project', id),
    updateProjectPin: (id: string, pinned: boolean) => ipcRenderer.invoke('update-project-pin', id, pinned),
    selectDirectory: () => ipcRenderer.invoke('select-directory'),
    getHardwareInfo: () => ipcRenderer.invoke('get-hardware-info'),

    openSettingsWindow: () => ipcRenderer.invoke('open-settings-window'),

    getPinnedPath: () => ipcRenderer.invoke('get-pinned-path'),
    setPinnedPath: (path: string) => ipcRenderer.invoke('set-pinned-path', path),

    getApiKey: (provider: string) => ipcRenderer.invoke('get-api-key', provider),
    setApiKey: (provider: string, key: string) => ipcRenderer.invoke('set-api-key', provider, key),
    getPrompts: () => ipcRenderer.invoke('get-prompts'),
    savePrompts: (prompts: any[]) => ipcRenderer.invoke('save-prompts', prompts),
    getActivePromptId: () => ipcRenderer.invoke('get-active-prompt-id'),
    setActivePromptId: (id: string) => ipcRenderer.invoke('set-active-prompt-id', id),
    createProjectFolder: (basePath: string, projectName: string) => ipcRenderer.invoke('create-project-folder', basePath, projectName),
    getProjectMetadata: (projectPath: string) => ipcRenderer.invoke('get-project-metadata', projectPath),
    saveProjectMetadata: (projectPath: string, metadata: any) => ipcRenderer.invoke('save-project-metadata', projectPath, metadata),
    resetProjectData: (projectPath: string) => ipcRenderer.invoke('reset-project-data', projectPath),
    getVideoInfo: (url: string) => ipcRenderer.invoke('get-video-info', url),
    getVideoFormats: (url: string) => ipcRenderer.invoke('get-video-formats', url),
    downloadVideo: (url: string, projectPath: string, formatId?: string) => ipcRenderer.send('download-video', url, projectPath, formatId),
    onDownloadProgress: (callback: (progress: { video: number; audio: number }) => void) => ipcRenderer.on('download-progress', (_, progress) => callback(progress)),
    onDownloadComplete: (callback: (success: boolean) => void) => ipcRenderer.on('download-complete', (_, success) => callback(success)),
    removeDownloadListeners: () => {
        ipcRenderer.removeAllListeners('download-progress');
        ipcRenderer.removeAllListeners('download-complete');
    },

    selectVideoFile: () => ipcRenderer.invoke('select-video-file'),
    importLocalVideo: (filePath: string, projectPath: string) => ipcRenderer.send('import-local-video', filePath, projectPath),
    onImportLocalProgress: (callback: (progress: any) => void) => ipcRenderer.on('import-local-progress', (_, progress) => callback(progress)),
    onImportLocalComplete: (callback: (success: boolean) => void) => ipcRenderer.on('import-local-complete', (_, success) => callback(success)),
    removeImportLocalListeners: () => {
        ipcRenderer.removeAllListeners('import-local-progress');
        ipcRenderer.removeAllListeners('import-local-complete');
    },

    checkEnvironment: () => ipcRenderer.invoke('check-environment'),
    setupEnvironment: () => ipcRenderer.send('setup-environment'),
    onSetupProgress: (callback: (progress: any) => void) => ipcRenderer.on('setup-progress', (_, progress) => callback(progress)),
    removeSetupListeners: () => {
        ipcRenderer.removeAllListeners('setup-progress');
    },

    getExistingSrt: (projectPath: string) => ipcRenderer.invoke('get-existing-srt', projectPath),
    transcribeAudio: (projectPath: string, engine?: string, language?: string) => ipcRenderer.send('transcribe-audio', projectPath, engine, language),
    onTranscriptProgress: (callback: (progress: any) => void) => ipcRenderer.on('transcript-progress', (_, progress) => callback(progress)),
    onTranscriptComplete: (callback: (result: any) => void) => ipcRenderer.on('transcript-complete', (_, result) => callback(result)),
    removeTranscriptListeners: () => {
        ipcRenderer.removeAllListeners('transcript-progress');
        ipcRenderer.removeAllListeners('transcript-complete');
    },

    readAudioFile: (projectPath: string) => ipcRenderer.invoke('read-audio-file', projectPath),

    checkWhisperEngine: (engine: string) => ipcRenderer.invoke('check-whisper-engine', engine),




    getWhisperDownloadStatus: () => ipcRenderer.invoke('get-whisper-download-status'),
    listWhisperModels: () => ipcRenderer.invoke('list-whisper-models'),
    downloadWhisperModel: (modelId: string) => ipcRenderer.invoke('download-whisper-model', modelId),
    onWhisperModelDownloadProgress: (callback: (progress: any) => void) => ipcRenderer.on('whisper-model-download-progress', (_, progress) => callback(progress)),
    removeWhisperModelListeners: () => ipcRenderer.removeAllListeners('whisper-model-download-progress'),
    deleteWhisperModel: (modelId: string) => ipcRenderer.invoke('delete-whisper-model', modelId),
    getActiveWhisperModel: () => ipcRenderer.invoke('get-active-whisper-model'),
    setActiveWhisperModel: (modelId: string) => ipcRenderer.invoke('set-active-whisper-model', modelId),

    optimizeSrt: (srtPath: string) => ipcRenderer.invoke('optimize-srt', srtPath),

    saveTranslatedSrt: (projectPath: string, lang: string, content: string) => ipcRenderer.invoke('save-translated-srt', projectPath, lang, content),
    getTranslatedSrt: (projectPath: string, lang: string) => ipcRenderer.invoke('get-translated-srt', projectPath, lang),

    generateAudio: (projectPath: string, lang: string, voiceId?: string) => ipcRenderer.send('generate-audio', projectPath, lang, voiceId),
    cancelAudioGeneration: () => ipcRenderer.send('cancel-audio-generation'),
    generateSingleAudio: (projectPath: string, lang: string, targetIndex: number, voiceId?: string) => ipcRenderer.invoke('generate-single-audio', projectPath, lang, targetIndex, voiceId),
    retryFailedAudio: (projectPath: string, lang: string, failedIndices: number[], voiceId?: string) => ipcRenderer.invoke('retry-failed-audio', projectPath, lang, failedIndices, voiceId),
    onAudioGenerateProgress: (callback: (progress: any) => void) => ipcRenderer.on('audio-generate-progress', (event, progress) => callback(progress)),
    removeAudioGenerateListeners: () => ipcRenderer.removeAllListeners('audio-generate-progress'),
    listGeneratedAudio: (projectPath: string) => ipcRenderer.invoke('list-generated-audio', projectPath),
    generateVoicePreview: (projectPath: string, lang: string, voiceId: string) => ipcRenderer.invoke('generate-voice-preview', projectPath, lang, voiceId),
    cleanupOldPreviews: (projectPath: string) => ipcRenderer.invoke('cleanup-old-previews', projectPath),
    getVoicePreference: (projectPath: string, lang: string) => ipcRenderer.invoke('get-voice-preference', projectPath, lang),
    setVoicePreference: (projectPath: string, lang: string, voiceId: string) => ipcRenderer.invoke('set-voice-preference', projectPath, lang, voiceId),
    getConcurrencySettings: (projectPath: string) => ipcRenderer.invoke('get-concurrency-settings', projectPath),
    setConcurrencySettings: (projectPath: string, settings: { initial: number; min: number; max: number }) => ipcRenderer.invoke('set-concurrency-settings', projectPath, settings),
    getVoicesForLanguage: (lang: string) => ipcRenderer.invoke('get-voices-for-language', lang),

    readGeneratedAudio: (filePath: string) => ipcRenderer.invoke('read-generated-audio', filePath),
    readVideoFile: (filePath: string) => ipcRenderer.invoke('read-video-file', filePath),

    checkFinalVideoReady: (projectPath: string) => ipcRenderer.invoke('check-final-video-ready', projectPath),
    createFinalVideo: (projectPath: string, options?: { backgroundVolume?: number, fadeDuration?: number, lang?: string }) => ipcRenderer.send('create-final-video', projectPath, options),
    cancelFinalVideo: () => ipcRenderer.send('cancel-final-video'),
    onFinalVideoProgress: (callback: (progress: any) => void) => ipcRenderer.on('final-video-progress', (_, progress) => callback(progress)),
    removeFinalVideoListeners: () => ipcRenderer.removeAllListeners('final-video-progress'),
    openInExplorer: (filePath: string) => ipcRenderer.invoke('open-in-explorer', filePath),
    openFile: (filePath: string) => ipcRenderer.invoke('open-file', filePath),
    checkProjectPhases: (projectPath: string) => ipcRenderer.invoke('check-project-phases', projectPath),

    mcpGetStatus: () => ipcRenderer.invoke('mcp-get-status'),

    getDefaultBackgroundVolume: () => ipcRenderer.invoke('get-default-background-volume'),
    setDefaultBackgroundVolume: (volume: number) => ipcRenderer.invoke('set-default-background-volume', volume),
    getDefaultFadeDuration: () => ipcRenderer.invoke('get-default-fade-duration'),
    setDefaultFadeDuration: (duration: number) => ipcRenderer.invoke('set-default-fade-duration', duration),
});
