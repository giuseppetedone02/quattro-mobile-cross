import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useTheme } from '@/theme';

/**
 * Set di icone proprio, disegnato a mano in SVG.
 *
 * Perche' non una libreria: @expo/vector-icons e' deprecato in favore dei
 * pacchetti @react-native-vector-icons/*, e per ~20 icone una dipendenza
 * nativa in piu' e' un rischio (e un peso) che non serve. Qui il tratto e' lo
 * stesso su tutte, il colore viene dal tema, e non c'e' nulla da aggiornare.
 *
 * Ogni icona e' decorativa per default (accessibilityElementsHidden): il
 * significato lo porta l'accessibilityLabel del controllo che la contiene.
 * E' la contromisura al difetto di WantABook, dove i bottoni avevano solo
 * emoji come contenuto e uno screen reader non leggeva nulla di utile.
 */

export type IconName =
  | 'plus' | 'search' | 'close' | 'check' | 'chevronRight' | 'chevronLeft'
  | 'chevronDown' | 'arrowLeft' | 'more' | 'edit' | 'trash' | 'refresh'
  | 'map' | 'pin' | 'list' | 'users' | 'user' | 'mail' | 'camera' | 'image'
  | 'star' | 'palette' | 'logout' | 'google' | 'external' | 'warning'
  | 'info' | 'location' | 'service' | 'menu' | 'receipt' | 'move' | 'link'
  | 'copy' | 'share';

type Props = {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
};

export function Icon({ name, size = 22, color, strokeWidth = 1.9 }: Props) {
  const theme = useTheme();
  const stroke = color ?? theme.colors.textPrimary;
  const common = {
    stroke,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none' as const,
  };

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {paths(name, stroke, common)}
    </Svg>
  );
}

function paths(
  name: IconName,
  stroke: string,
  c: {
    stroke: string;
    strokeWidth: number;
    strokeLinecap: 'round';
    strokeLinejoin: 'round';
    fill: 'none';
  },
) {
  switch (name) {
    case 'plus':
      return <Path {...c} d="M12 5v14M5 12h14" />;
    case 'search':
      return (
        <>
          <Circle {...c} cx={11} cy={11} r={6.5} />
          <Path {...c} d="M16 16l4 4" />
        </>
      );
    case 'close':
      return <Path {...c} d="M6 6l12 12M18 6L6 18" />;
    case 'check':
      return <Path {...c} d="M5 13l4.5 4.5L19 7" />;
    case 'chevronRight':
      return <Path {...c} d="M9 5l7 7-7 7" />;
    case 'chevronLeft':
      return <Path {...c} d="M15 5l-7 7 7 7" />;
    case 'chevronDown':
      return <Path {...c} d="M5 9l7 7 7-7" />;
    case 'arrowLeft':
      return <Path {...c} d="M19 12H5M11 6l-6 6 6 6" />;
    case 'more':
      return (
        <>
          <Circle cx={12} cy={5} r={1.6} fill={stroke} />
          <Circle cx={12} cy={12} r={1.6} fill={stroke} />
          <Circle cx={12} cy={19} r={1.6} fill={stroke} />
        </>
      );
    case 'edit':
      return <Path {...c} d="M4 20h4l10-10-4-4L4 16v4zM14 6l4 4" />;
    case 'trash':
      return <Path {...c} d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />;
    case 'refresh':
      return (
        <Path
          {...c}
          d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4"
        />
      );
    case 'map':
      return <Path {...c} d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" />;
    case 'pin':
      return (
        <>
          <Path {...c} d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" />
          <Circle {...c} cx={12} cy={10} r={2.6} />
        </>
      );
    case 'list':
      return <Path {...c} d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />;
    case 'users':
      return (
        <>
          <Circle {...c} cx={9} cy={8} r={3.4} />
          <Path {...c} d="M3 20a6 6 0 0 1 12 0M16.5 5.2a3.4 3.4 0 0 1 0 5.6M18 20a6 6 0 0 0-2-4.5" />
        </>
      );
    case 'user':
      return (
        <>
          <Circle {...c} cx={12} cy={8} r={3.6} />
          <Path {...c} d="M5 20a7 7 0 0 1 14 0" />
        </>
      );
    case 'mail':
      return (
        <>
          <Rect {...c} x={3} y={5.5} width={18} height={13} rx={2.5} />
          <Path {...c} d="M4 7l8 6 8-6" />
        </>
      );
    case 'camera':
      return (
        <>
          <Path {...c} d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.7l1.3-2h7l1.3 2h1.7A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-9z" />
          <Circle {...c} cx={12} cy={13} r={3.4} />
        </>
      );
    case 'image':
      return (
        <>
          <Rect {...c} x={3} y={4.5} width={18} height={15} rx={2.5} />
          <Circle {...c} cx={8.5} cy={9.5} r={1.6} />
          <Path {...c} d="M3.5 17l5-5 4 4 3-2.5 5 4" />
        </>
      );
    case 'star':
      return (
        <Path
          {...c}
          d="M12 3.5l2.7 5.6 6.1.8-4.4 4.3 1.1 6.1-5.5-3-5.5 3 1.1-6.1L3.2 9.9l6.1-.8z"
        />
      );
    case 'palette':
      return (
        <>
          <Path {...c} d="M12 3a9 9 0 1 0 0 18c1.4 0 2-.9 2-1.9 0-1.6-1.5-1.9-1.5-3.1 0-1 .8-1.7 2-1.7h1.8A4.7 4.7 0 0 0 21 9.6C21 5.9 17 3 12 3z" />
          <Circle cx={8} cy={10} r={1.4} fill={stroke} />
          <Circle cx={12} cy={7.5} r={1.4} fill={stroke} />
          <Circle cx={16} cy={9.5} r={1.4} fill={stroke} />
        </>
      );
    case 'logout':
      return <Path {...c} d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13A1.5 1.5 0 0 1 18.5 20H15M11 8l-4 4 4 4M7 12h9" />;
    case 'google':
      // Il "G" di Google, monocromatico: il colore del brand starebbe sul
      // bottone, non sull'icona, e va a contrasto col tema.
      return (
        <Path
          {...c}
          d="M20.4 12.2c0-.6-.05-1.2-.16-1.8H12v3.5h4.7a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.6-3.9 2.6-6.6zM12 21c2.4 0 4.4-.8 5.8-2.2l-2.9-2.2a5.4 5.4 0 0 1-8-2.8H4v2.3A9 9 0 0 0 12 21zM6.9 13.8a5.4 5.4 0 0 1 0-3.5V8H4a9 9 0 0 0 0 8.1l2.9-2.3zM12 6.6c1.3 0 2.5.45 3.4 1.35l2.55-2.55A9 9 0 0 0 4 8l2.9 2.3A5.4 5.4 0 0 1 12 6.6z"
        />
      );
    case 'external':
      return <Path {...c} d="M14 5h5v5M19 5l-8 8M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />;
    case 'warning':
      return <Path {...c} d="M12 4l9 16H3l9-16zM12 10v4.5M12 17.5h.01" />;
    case 'info':
      return (
        <>
          <Circle {...c} cx={12} cy={12} r={8.5} />
          <Path {...c} d="M12 11v5.5M12 7.8h.01" />
        </>
      );
    // --- I quattro criteri hanno un'icona propria: il colore non e' mai
    //     l'unico canale che distingue un criterio da un altro. ---
    case 'location':
      // Un arco: l'ambiente, il posto
      return <Path {...c} d="M4 20V11l8-6 8 6v9M9 20v-6h6v6" />;
    case 'service':
      // Un vassoio con cupola: il servizio al tavolo
      return <Path {...c} d="M3.5 17h17M5 17a7 7 0 0 1 14 0M12 10V7.5M10.5 6.5h3" />;
    case 'menu':
      // Un libro aperto: il menu
      return <Path {...c} d="M12 6.5C10.5 5 8 4.5 4 5v13c4-.5 6.5 0 8 1.5 1.5-1.5 4-2 8-1.5V5c-4-.5-6.5 0-8 1.5zM12 6.5v13" />;
    case 'receipt':
      // Uno scontrino: il conto
      return <Path {...c} d="M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9.5 8h5M9.5 12h5" />;
    case 'move':
      return <Path {...c} d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" />;
    case 'link':
      return <Path {...c} d="M10 13a4.5 4.5 0 0 0 6.4 0l2.1-2.1a4.5 4.5 0 0 0-6.4-6.4L11 5.6M14 11a4.5 4.5 0 0 0-6.4 0L5.5 13.1a4.5 4.5 0 0 0 6.4 6.4L13 18.4" />;
    case 'copy':
      return (
        <>
          <Rect {...c} x={8.5} y={8.5} width={11} height={11} rx={2} />
          <Path {...c} d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
        </>
      );
    case 'share':
      return (
        <>
          <Circle {...c} cx={18} cy={6} r={2.4} />
          <Circle {...c} cx={18} cy={18} r={2.4} />
          <Circle {...c} cx={6} cy={12} r={2.4} />
          <Path {...c} d="M8.1 10.8l7.8-3.6M8.1 13.2l7.8 3.6" />
        </>
      );
    default:
      return null;
  }
}
