import { Volume2, Loader2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { getPresetsForLanguage } from '@/services/tts/VoiceCatalog';

export interface VoiceSelectorProps {
  language: string;
  selectedVoiceId: string;
  onVoiceChange: (voiceId: string) => void;
  onPreview?: () => void;
  onShowAllVoices?: () => void;
  disabled?: boolean;
  isPreviewPlaying?: boolean;
}

export function VoiceSelector({
  language,
  selectedVoiceId,
  onVoiceChange,
  onPreview,
  onShowAllVoices,
  disabled,
  isPreviewPlaying,
}: VoiceSelectorProps) {
  const presets = getPresetsForLanguage(language);

  return (
    <div className="flex items-center gap-2">
      <Select
        value={selectedVoiceId}
        onValueChange={onVoiceChange}
        disabled={disabled}
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Select a voice" />
        </SelectTrigger>
        <SelectContent>
          {presets.map((voice) => (
            <SelectItem key={voice.id} value={voice.id}>
              {voice.label}
            </SelectItem>
          ))}
          {onShowAllVoices && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start px-2 text-muted-foreground"
              onClick={(e) => {
                e.preventDefault();
                onShowAllVoices();
              }}
            >
              More voices...
            </Button>
          )}
        </SelectContent>
      </Select>
      {onPreview && (
        <Button
          variant="outline"
          size="icon"
          onClick={onPreview}
          disabled={disabled}
          aria-label="Preview voice"
        >
          {isPreviewPlaying ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )}
        </Button>
      )}
    </div>
  );
}