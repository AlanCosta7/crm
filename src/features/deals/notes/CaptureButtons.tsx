/**
 * Botões de câmera do composer.
 *
 * Usam `<input type="file" capture>`, que abre o app de câmera nativo do
 * Android e do iOS — foco, HDR, flash e estabilização de graça, muito melhor
 * do que um preview caseiro com `getUserMedia`. Em troca, só aparecem em
 * aparelho de toque: no desktop o `capture` é ignorado e o input abriria o
 * mesmo seletor de arquivos que o botão "Anexar" já oferece.
 */
import { useRef } from 'react';
import { Icon } from '../../../components/ui/Icon';

interface CaptureButtonsProps {
  onCapture: (files: FileList | null) => void;
  disabled?: boolean;
}

export function CaptureButtons({ onCapture, disabled }: CaptureButtonsProps) {
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);

  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    onCapture(e.target.files);
    e.target.value = ''; // permite capturar de novo na sequência
  };

  return (
    <>
      <input
        ref={photoInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only-input"
        onChange={handle}
      />
      <input
        ref={videoInput}
        type="file"
        accept="video/*"
        capture="environment"
        className="sr-only-input"
        onChange={handle}
      />

      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => photoInput.current?.click()}
        disabled={disabled}
        title="Tirar foto com a câmera"
      >
        <Icon name="Camera" size={15} /> Foto
      </button>

      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => videoInput.current?.click()}
        disabled={disabled}
        title="Gravar vídeo com a câmera"
      >
        <Icon name="Video" size={15} /> Vídeo
      </button>
    </>
  );
}
