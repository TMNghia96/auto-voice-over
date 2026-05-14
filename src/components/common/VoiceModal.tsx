import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Volume2, Search } from 'lucide-react';
import type { VoiceOption } from '@/services/tts/VoiceCatalog';

interface VoiceModalProps {
  language: string;
  voices: VoiceOption[];
  selectedVoiceId: string;
  open: boolean;
  onClose: () => void;
  onSelectVoice: (voiceId: string) => void;
  onPreview?: (voiceId: string) => void;
}

export const VoiceModal = ({
  language,
  voices,
  selectedVoiceId,
  open,
  onClose,
  onSelectVoice,
  onPreview,
}: VoiceModalProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [genderFilter, setGenderFilter] = useState<'All' | 'Male' | 'Female'>('All');

  const allVoices = voices;

  const filteredVoices = allVoices.filter((voice) => {
    const matchesSearch = voice.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         voice.label.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesGender = genderFilter === 'All' || voice.gender === genderFilter;
    return matchesSearch && matchesGender;
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Select Voice</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* Search and Filter */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search voices..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-1">
              {(['All', 'Male', 'Female'] as const).map((filter) => (
                <Button
                  key={filter}
                  variant={genderFilter === filter ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setGenderFilter(filter)}
                >
                  {filter}
                </Button>
              ))}
            </div>
          </div>

          {/* Voice Grid */}
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              {filteredVoices.map((voice) => (
                <div
                  key={voice.id}
                  className={`border rounded-lg p-3 cursor-pointer transition-colors hover:bg-accent ${
                    selectedVoiceId === voice.id ? 'border-primary bg-primary/5' : ''
                  }`}
                  onClick={() => {
                    onSelectVoice(voice.id);
                    onClose();
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{voice.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {voice.gender}
                        {voice.isPreset && (
                          <span className="ml-2 text-primary">★ Preset</span>
                        )}
                      </div>
                    </div>
                    {onPreview && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 w-8 h-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          onPreview(voice.id);
                        }}
                      >
                        <Volume2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
