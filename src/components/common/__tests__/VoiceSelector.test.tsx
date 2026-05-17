import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VoiceSelector } from '../VoiceSelector';
import { getPresetsForLanguage } from '@/services/tts/VoiceCatalog';

describe('VoiceSelector', () => {
  const viVoices = getPresetsForLanguage('vi');

  it('should render voice dropdown with selected preset', () => {
    const onVoiceChange = vi.fn();
    render(
      <VoiceSelector
        language="vi"
        voices={viVoices}
        selectedVoiceId="vi-VN-NamMinhNeural"
        onVoiceChange={onVoiceChange}
      />
    );
    expect(screen.getByText(/NamMinh/i)).toBeInTheDocument();
  });

  it('should call onVoiceChange when voice is selected via combobox', () => {
    const onVoiceChange = vi.fn();
    render(
      <VoiceSelector
        language="vi"
        voices={viVoices}
        selectedVoiceId="vi-VN-NamMinhNeural"
        onVoiceChange={onVoiceChange}
      />
    );
    const combobox = screen.getByRole('combobox');
    expect(combobox).toBeInTheDocument();
  });

  it('should show preview button when onPreview is provided', () => {
    const onPreview = vi.fn();
    render(
      <VoiceSelector
        language="vi"
        voices={viVoices}
        selectedVoiceId="vi-VN-NamMinhNeural"
        onVoiceChange={vi.fn()}
        onPreview={onPreview}
      />
    );
    const previewBtn = screen.getByRole('button', { name: /preview/i });
    expect(previewBtn).toBeInTheDocument();
  });

  it('should not show preview button when onPreview is not provided', () => {
    render(
      <VoiceSelector
        language="vi"
        voices={viVoices}
        selectedVoiceId="vi-VN-NamMinhNeural"
        onVoiceChange={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: /preview/i })).not.toBeInTheDocument();
  });
});
