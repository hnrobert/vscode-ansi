export type Color = NamedColor | RgbColor;

export enum ColorFlags {
  Named = 1 << 24,
  Bright = 1 << 25,
}

export enum NamedColor {
  DefaultBackground = ColorFlags.Named | 0xf0,
  DefaultForeground = ColorFlags.Named | 0xf1,

  Black = ColorFlags.Named | 0,
  Red = ColorFlags.Named | 1,
  Green = ColorFlags.Named | 2,
  Yellow = ColorFlags.Named | 3,
  Blue = ColorFlags.Named | 4,
  Magenta = ColorFlags.Named | 5,
  Cyan = ColorFlags.Named | 6,
  White = ColorFlags.Named | 7,

  BrightBlack = ColorFlags.Named | ColorFlags.Bright | NamedColor.Black,
  BrightRed = ColorFlags.Named | ColorFlags.Bright | NamedColor.Red,
  BrightGreen = ColorFlags.Named | ColorFlags.Bright | NamedColor.Green,
  BrightYellow = ColorFlags.Named | ColorFlags.Bright | NamedColor.Yellow,
  BrightBlue = ColorFlags.Named | ColorFlags.Bright | NamedColor.Blue,
  BrightMagenta = ColorFlags.Named | ColorFlags.Bright | NamedColor.Magenta,
  BrightCyan = ColorFlags.Named | ColorFlags.Bright | NamedColor.Cyan,
  BrightWhite = ColorFlags.Named | ColorFlags.Bright | NamedColor.White,
}

export type RgbColor = number;

export enum AttributeFlags {
  None = 0,

  Bold = 1 << 0,
  Faint = 1 << 1,
  Italic = 1 << 2,
  Underline = 1 << 3,
  SlowBlink = 1 << 4,
  RapidBlink = 1 << 5,
  Inverse = 1 << 6,
  Conceal = 1 << 7,
  CrossedOut = 1 << 8,
  Fraktur = 1 << 9,
  DoubleUnderline = 1 << 10,
  Proportional = 1 << 11,
  Framed = 1 << 12,
  Encircled = 1 << 13,
  Overlined = 1 << 14,
  Superscript = 1 << 15,
  Subscript = 1 << 16,

  EscapeSequence = 1 << 31,
}

export interface Style {
  backgroundColor: Color;
  foregroundColor: Color;
  attributeFlags: AttributeFlags;
  fontIndex: number;
}

export const DefaultStyle: Style = {
  backgroundColor: NamedColor.DefaultBackground,
  foregroundColor: NamedColor.DefaultForeground,
  attributeFlags: 0,
  fontIndex: 0,
};

export interface Span extends Style {
  offset: number;
  length: number;
}

export interface ParserOptions {
  doubleUnderline?: boolean;
}

export class Parser {
  public constructor(public options: ParserOptions = { doubleUnderline: false }) {}

  private _finalStyle: Style = { ...DefaultStyle };

  public clear(): void {
    this._finalStyle = { ...DefaultStyle };
  }

  public appendLine(text: string): Span[] {
    return this._parseLine(text, this._finalStyle);
  }

  private _parseLine(text: string, style: Style): Span[] {
    const spans: Span[] = [];

    let textOffset = 0;
    let index = 0;

    while (index < text.length) {
      if (text.codePointAt(index) !== 0x1b) {
        let escOffset = text.indexOf("\x1b", index);
        if (escOffset === -1) escOffset = text.length;

        spans.push({ ...style, offset: textOffset, length: escOffset - textOffset });

        textOffset = escOffset;
        index = escOffset;
        continue;
      }

      if (index === text.length - 1) {
        break;
      }

      if (text[index + 1] === "[") {
        // Handle CSI (Control Sequence Introducer) sequences - ESC[
        const csiResult = this._handleCsiSequence(text, index, style);
        if (csiResult) {
          spans.push(csiResult.span);
          textOffset = csiResult.nextIndex;
          index = textOffset;
          continue;
        }
      } else if (text[index + 1] === "]") {
        // Handle OSC (Operating System Command) sequences - ESC]
        const oscResult = this._handleOscSequence(text, index, style);
        if (oscResult) {
          spans.push(oscResult.span);
          textOffset = oscResult.nextIndex;
          index = textOffset;
          continue;
        }
      } else {
        // Handle other escape sequences (like ESC=, ESC>, ESC( for charset selection)
        const nonCsiMatch = text
          .slice(index + 1)
          // Match any printable 7-bit ASCII character (space through tilde)
          .match(/^([\x20-\x7E])/);
        if (nonCsiMatch) {
          // Mark these non-printing, non-formatting escape sequences so they get dimmed in the editor
          spans.push({
            ...style,
            offset: index,
            length: 2,
            attributeFlags: style.attributeFlags | AttributeFlags.EscapeSequence,
          });

          // And skip them from visible text (used by pretty provider)
          textOffset = index + 2;
          index = textOffset;
          continue;
        }
      }

      index += 1;
    }

    spans.push({ ...style, offset: textOffset, length: index - textOffset });

    return spans;
  }

  private _applyCodes(args: number[], style: Style): void {
    for (let argIndex = 0; argIndex < args.length; argIndex += 1) {
      const code = args[argIndex];

      switch (code) {
        case 0:
          Object.assign(style, DefaultStyle);
          break;

        case 1:
          style.attributeFlags |= AttributeFlags.Bold;
          style.attributeFlags &= ~AttributeFlags.Faint;
          break;

        case 2:
          style.attributeFlags |= AttributeFlags.Faint;
          style.attributeFlags &= ~AttributeFlags.Bold;
          break;

        case 3:
          style.attributeFlags |= AttributeFlags.Italic;
          style.attributeFlags &= ~AttributeFlags.Fraktur;
          break;

        case 4:
          style.attributeFlags |= AttributeFlags.Underline;
          style.attributeFlags &= ~AttributeFlags.DoubleUnderline;
          break;

        case 5:
          style.attributeFlags |= AttributeFlags.SlowBlink;
          style.attributeFlags &= ~AttributeFlags.RapidBlink;
          break;

        case 6:
          style.attributeFlags |= AttributeFlags.RapidBlink;
          style.attributeFlags &= ~AttributeFlags.SlowBlink;
          break;

        case 7:
          style.attributeFlags |= AttributeFlags.Inverse;
          break;

        case 8:
          style.attributeFlags |= AttributeFlags.Conceal;
          break;

        case 9:
          style.attributeFlags |= AttributeFlags.CrossedOut;
          break;

        case 10:
        case 11:
        case 12:
        case 13:
        case 14:
        case 15:
        case 16:
        case 17:
        case 18:
        case 19:
          style.fontIndex = code - 10;
          break;

        case 20:
          style.attributeFlags |= AttributeFlags.Fraktur;
          style.attributeFlags &= ~AttributeFlags.Italic;
          break;

        case 21:
          if (this.options.doubleUnderline) {
            style.attributeFlags |= AttributeFlags.DoubleUnderline;
            style.attributeFlags &= ~AttributeFlags.Underline;
            break;
          }

          style.attributeFlags &= ~AttributeFlags.Bold;
          break;

        case 22:
          style.attributeFlags &= ~AttributeFlags.Bold;
          style.attributeFlags &= ~AttributeFlags.Faint;
          break;

        case 23:
          style.attributeFlags &= ~AttributeFlags.Italic;
          style.attributeFlags &= ~AttributeFlags.Fraktur;
          break;

        case 24:
          style.attributeFlags &= ~AttributeFlags.Underline;
          style.attributeFlags &= ~AttributeFlags.DoubleUnderline;
          break;

        case 25:
          style.attributeFlags &= ~AttributeFlags.SlowBlink;
          style.attributeFlags &= ~AttributeFlags.RapidBlink;
          break;

        case 26:
          style.attributeFlags |= AttributeFlags.Proportional;
          break;

        case 27:
          style.attributeFlags &= ~AttributeFlags.Inverse;
          break;

        case 28:
          style.attributeFlags &= ~AttributeFlags.Conceal;
          break;

        case 29:
          style.attributeFlags &= ~AttributeFlags.CrossedOut;
          break;

        case 30:
        case 31:
        case 32:
        case 33:
        case 34:
        case 35:
        case 36:
        case 37:
          style.foregroundColor = ColorFlags.Named | (code - 30);
          break;

        case 38: {
          const colorType = args[argIndex + 1];

          if (colorType === 5) {
            const color = args[argIndex + 2];
            argIndex += 2;

            if (0 <= color && color <= 255) {
              style.foregroundColor = this._convert8BitColor(color);
            }
          }

          if (colorType === 2) {
            const r = args[argIndex + 2];
            const g = args[argIndex + 3];
            const b = args[argIndex + 4];
            argIndex += 4;

            if (0 <= r && r <= 255 && 0 <= g && g <= 255 && 0 <= b && b <= 255) {
              style.foregroundColor = (r << 16) | (g << 8) | b;
            }
          }

          break;
        }

        case 39:
          style.foregroundColor = DefaultStyle.foregroundColor;
          break;

        case 40:
        case 41:
        case 42:
        case 43:
        case 44:
        case 45:
        case 46:
        case 47:
          style.backgroundColor = ColorFlags.Named | (code - 40);
          break;

        case 48: {
          const colorType = args[argIndex + 1];

          if (colorType === 5) {
            const color = args[argIndex + 2];
            argIndex += 2;

            if (0 <= color && color <= 255) {
              style.backgroundColor = this._convert8BitColor(color);
            }
          }

          if (colorType === 2) {
            const r = args[argIndex + 2];
            const g = args[argIndex + 3];
            const b = args[argIndex + 4];
            argIndex += 4;

            if (0 <= r && r <= 255 && 0 <= g && g <= 255 && 0 <= b && b <= 255) {
              style.backgroundColor = (r << 16) | (g << 8) | b;
            }
          }

          break;
        }

        case 49:
          style.backgroundColor = DefaultStyle.backgroundColor;
          break;

        case 50:
          style.attributeFlags &= ~AttributeFlags.Proportional;
          break;

        case 51:
          style.attributeFlags |= AttributeFlags.Framed;
          style.attributeFlags &= ~AttributeFlags.Encircled;
          break;

        case 52:
          style.attributeFlags |= AttributeFlags.Encircled;
          style.attributeFlags &= ~AttributeFlags.Framed;
          break;

        case 53:
          style.attributeFlags |= AttributeFlags.Overlined;
          break;

        case 54:
          style.attributeFlags &= ~AttributeFlags.Framed;
          style.attributeFlags &= ~AttributeFlags.Encircled;
          break;

        case 55:
          style.attributeFlags &= ~AttributeFlags.Overlined;
          break;

        case 58:
          // TODO: underline colors
          break;

        case 59:
          // TODO: underline colors
          break;

        case 73:
          style.attributeFlags |= AttributeFlags.Superscript;
          style.attributeFlags &= ~AttributeFlags.Subscript;
          break;

        case 74:
          style.attributeFlags |= AttributeFlags.Subscript;
          style.attributeFlags &= ~AttributeFlags.Superscript;
          break;

        case 90:
        case 91:
        case 92:
        case 93:
        case 94:
        case 95:
        case 96:
        case 97:
          style.foregroundColor = ColorFlags.Named | ColorFlags.Bright | (code - 90);
          break;

        case 100:
        case 101:
        case 102:
        case 103:
        case 104:
        case 105:
        case 106:
        case 107:
          style.backgroundColor = ColorFlags.Named | ColorFlags.Bright | (code - 100);
          break;
      }
    }
  }

  private _convert8BitColor(color: number): Color {
    if (0 <= color && color <= 7) {
      return ColorFlags.Named | color;
    }

    if (8 <= color && color <= 15) {
      return ColorFlags.Named | ColorFlags.Bright | (color - 8);
    }

    if (232 <= color && color <= 255) {
      const intensity = ((255 * (color - 232)) / 23) | 0;
      return (intensity << 16) | (intensity << 8) | intensity;
    }

    let color6 = color - 16;

    const b6 = color6 % 6;
    color6 = (color6 / 6) | 0;

    const g6 = color6 % 6;
    color6 = (color6 / 6) | 0;

    const r6 = color6;

    const r = ((255 * r6) / 5) | 0;
    const g = ((255 * g6) / 5) | 0;
    const b = ((255 * b6) / 5) | 0;

    return (r << 16) | (g << 8) | b;
  }

  /**
   * Handle CSI (Control Sequence Introducer) sequences - ESC[
   */
  private _handleCsiSequence(text: string, index: number, style: Style): { span: Span; nextIndex: number } | null {
    // Enhanced pattern to support more CSI sequences including:
    // - Private parameter markers: ? ! >
    // - Parameter string: numbers, semicolons, colons
    // - Intermediate characters: space !"#$%&'()*+,-./
    // - Final character: @A-Z[\]^_`a-z{|}~
    const match = text
      .slice(index + 2)
      // CSI grammar byte classes:
      // private: 0x3C-0x3F  [<=>?]
      // params:  0x30-0x3F  [0-9:;<=>?]
      // interm:  0x20-0x2F  [\x20-\x2F] (includes space)
      // final:   0x40-0x7E  [@-~]
      .match(/^([<=>?]?)([0-9:;<=>?]*)([\x20-\x2F]*)([@-~])/);
    if (!match) {
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const privateMarker = match[1] ?? "";
    const argString = match[2] ?? "";
    const intermediateChars = match[3] ?? "";
    const commandLetter = match[4] ?? "";

    const span: Span = {
      ...style,
      offset: index,
      length: 2 + privateMarker.length + argString.length + intermediateChars.length + 1,
      attributeFlags: style.attributeFlags | AttributeFlags.EscapeSequence,
    };

    // Handle different types of CSI sequences
    if (commandLetter === "m") {
      const args = argString
        .split(";")
        .filter((arg) => arg !== "")
        .map((arg) => parseInt(arg, 10));
      if (args.length === 0) args.push(0);

      this._applyCodes(args, style);
    } else if (privateMarker === "?" && (commandLetter === "h" || commandLetter === "l")) {
      // Handle DEC Private Mode Set/Reset sequences like ?1h, ?1l
      this._handleDecPrivateMode(argString, commandLetter === "h", style);
    } else if (commandLetter === "H" || commandLetter === "f") {
      // Handle cursor position sequences
      this._handleCursorPosition(argString, style);
    } else if (
      commandLetter === "A" ||
      commandLetter === "B" ||
      commandLetter === "C" ||
      commandLetter === "D" ||
      commandLetter === "E" ||
      commandLetter === "F" ||
      commandLetter === "G"
    ) {
      // Handle cursor movement sequences
      this._handleCursorMovement(commandLetter, argString, style);
    } else if (commandLetter === "J" || commandLetter === "K") {
      // Handle erase sequences
      this._handleEraseSequences(commandLetter, argString, style);
    } else if (commandLetter === "S" || commandLetter === "T") {
      // Handle scroll sequences
      this._handleScrollSequences(commandLetter, argString, style);
    } else if (commandLetter === "s" || commandLetter === "u") {
      // Handle save/restore cursor position
      this._handleCursorSaveRestore(commandLetter, style);
    } else if (commandLetter === "n") {
      // Handle device status report and similar queries
      this._handleDeviceStatusReport(argString, style);
    } else if (commandLetter === "c") {
      // Handle device attributes
      this._handleDeviceAttributes(privateMarker, argString, style);
    } else if (commandLetter === "p" && intermediateChars.includes("!")) {
      // Handle soft terminal reset (DECSTR)
      this._handleSoftReset(style);
    }

    return {
      span,
      nextIndex: index + 2 + privateMarker.length + argString.length + intermediateChars.length + 1,
    };
  }

  /**
   * Handle OSC (Operating System Command) sequences - ESC]
   * These sequences typically end with BEL (0x07) or ESC\ (ST - String Terminator)
   */
  private _handleOscSequence(text: string, index: number, style: Style): { span: Span; nextIndex: number } | null {
    // Look for the terminator (BEL or ESC\)
    let endIndex = -1;
    for (let i = index + 2; i < text.length; i++) {
      if (text.codePointAt(i) === 0x07) {
        // BEL
        endIndex = i + 1;
        break;
      } else if (text.codePointAt(i) === 0x1b && i + 1 < text.length && text[i + 1] === "\\") {
        // ESC\
        endIndex = i + 2;
        break;
      }
    }

    if (endIndex === -1) {
      // No terminator found, treat as incomplete sequence
      return null;
    }

    const span: Span = {
      ...style,
      offset: index,
      length: endIndex - index,
      attributeFlags: style.attributeFlags | AttributeFlags.EscapeSequence,
    };

    // Parse OSC sequence
    const oscContent = text.slice(index + 2, endIndex - (text[endIndex - 1] === "\\" ? 2 : 1));
    const semicolonIndex = oscContent.indexOf(";");

    if (semicolonIndex !== -1) {
      const command = oscContent.slice(0, semicolonIndex);
      const data = oscContent.slice(semicolonIndex + 1);

      // Common OSC commands:
      // 0 - Set window title and icon name
      // 1 - Set icon name
      // 2 - Set window title
      // 4 - Set/query color palette
      // 10-19 - Set/query dynamic colors
      // 52 - Clipboard operations
      this._handleOscCommand(command, data, style);
    }

    return {
      span,
      nextIndex: endIndex,
    };
  }

  /**
   * Handle specific OSC commands
   */
  private _handleOscCommand(_command: string, _data: string, _style: Style): void {
    const commandNum = parseInt(_command, 10);

    switch (commandNum) {
      case 0:
      case 1:
      case 2:
        // Window/icon title - no visual effect in editor
        break;
      case 4:
        // Color palette manipulation - could affect colors in future
        break;
      case 10:
      case 11:
      case 12:
      case 13:
      case 14:
      case 15:
      case 16:
      case 17:
      case 18:
      case 19:
        // Dynamic color changes - could affect colors in future
        break;
      case 52:
        // Clipboard operations - no visual effect in editor
        break;
      default:
        // Unknown OSC command
        break;
    }
  }

  /**
   * Handle cursor save/restore commands (s and u)
   */
  private _handleCursorSaveRestore(_command: string, _style: Style): void {
    // s - Save cursor position and attributes
    // u - Restore cursor position and attributes
    // For display purposes, we just mark it as an escape sequence
  }

  /**
   * Handle DEC Private Mode Set/Reset sequences (ESC[?...h or ESC[?...l)
   * These sequences control various terminal behavior modes
   */
  private _handleDecPrivateMode(argString: string, _isSet: boolean, _style: Style): void {
    const _args = argString
      .split(";")
      .filter((arg) => arg !== "")
      .map((arg) => parseInt(arg, 10));

    // Common DEC private modes:
    // ?1 - Application Cursor Keys Mode
    // ?3 - 132 Column Mode
    // ?6 - Origin Mode
    // ?7 - Autowrap Mode
    // ?9 - X10 Mouse Reporting
    // ?25 - Cursor Visibility
    // ?47 - Alternate Screen Buffer
    // ?1000 - Normal Mouse Tracking
    // ?1002 - Button Event Mouse Tracking
    // ?1003 - Any Event Mouse Tracking
    // ?1006 - SGR Mouse Mode
    // ?1049 - Save cursor position and switch to alternate screen

    // For now, we'll just mark these as escape sequences without affecting styling
    // In a full terminal implementation, these would affect terminal behavior
  }

  /**
   * Handle cursor position sequences (ESC[...H or ESC[...f)
   */
  private _handleCursorPosition(argString: string, _style: Style): void {
    const args = argString
      .split(";")
      .filter((arg) => arg !== "")
      .map((arg) => parseInt(arg, 10));

    // Default position is 1,1 if no arguments
    const _row = args[0] || 1;
    const _col = args[1] || 1;

    // In a full terminal implementation, this would move the cursor
    // For display purposes, we just mark it as an escape sequence
  }

  /**
   * Handle cursor movement sequences
   * A - Cursor Up, B - Cursor Down, C - Cursor Forward, D - Cursor Backward
   * E - Cursor Next Line, F - Cursor Previous Line, G - Cursor Horizontal Absolute
   */
  private _handleCursorMovement(_command: string, argString: string, _style: Style): void {
    const _count = parseInt(argString, 10) || 1;

    // In a full terminal implementation, these would move the cursor
    // A - Move cursor up by count rows
    // B - Move cursor down by count rows
    // C - Move cursor forward by count columns
    // D - Move cursor backward by count columns
    // E - Move cursor to beginning of line, count lines down
    // F - Move cursor to beginning of line, count lines up
    // G - Move cursor to column count in current row

    // For display purposes, we just mark it as an escape sequence
  }

  /**
   * Handle erase sequences
   * J - Erase in Display, K - Erase in Line
   */
  private _handleEraseSequences(_command: string, argString: string, _style: Style): void {
    const _mode = parseInt(argString, 10) || 0;

    // if (command === "J") {
    // Erase in Display
    // 0 - Clear from cursor to end of screen
    // 1 - Clear from cursor to beginning of screen
    // 2 - Clear entire screen
    // 3 - Clear entire screen and delete all lines in scrollback buffer
    // } else if (command === "K") {
    // Erase in Line
    // 0 - Clear from cursor to end of line
    // 1 - Clear from cursor to beginning of line
    // 2 - Clear entire line
    // }

    // For display purposes, we just mark it as an escape sequence
  }

  /**
   * Handle scroll sequences
   * S - Scroll Up, T - Scroll Down
   */
  private _handleScrollSequences(_command: string, argString: string, _style: Style): void {
    const _count = parseInt(argString, 10) || 1;

    // S - Scroll up by count lines
    // T - Scroll down by count lines

    // For display purposes, we just mark it as an escape sequence
  }

  /**
   * Handle device status report sequences (ESC[6n, etc.)
   */
  private _handleDeviceStatusReport(argString: string, _style: Style): void {
    const _command = parseInt(argString, 10) || 6;

    // 5n - Device Status Report (answer: ESC[0n for ready, ESC[3n for malfunction)
    // 6n - Cursor Position Report (answer: ESC[row;columnR)

    // For display purposes, we just mark it as an escape sequence
  }

  /**
   * Handle device attributes sequences (ESC[c, ESC[>c)
   */
  private _handleDeviceAttributes(privateMarker: string, _argString: string, _style: Style): void {
    if (privateMarker === ">") {
      // Secondary Device Attributes
      // Reports terminal type and version
    } else {
      // Primary Device Attributes
      // Reports supported features
    }

    // For display purposes, we just mark it as an escape sequence
  }

  /**
   * Handle soft terminal reset (ESC[!p)
   */
  private _handleSoftReset(_style: Style): void {
    // Soft reset - resets terminal to initial state but doesn't clear screen
    // In a full implementation, this would reset various terminal settings
    // For display purposes, we just mark it as an escape sequence
  }
}
