import { FONT_OPTIONS, fontCss, fontOptionId } from "../../utils/fonts";

type Props = {
  value: string;
  onChange: (fontId: string) => void;
  label?: string;
};

export function FontPicker({ value, onChange, label = "Font" }: Props) {
  const id = fontOptionId(value);
  return (
    <label className="font-picker">
      {label}
      <select value={id} onChange={(e) => onChange(e.target.value)}>
        {FONT_OPTIONS.map((f) => (
          <option key={f.id} value={f.id} style={{ fontFamily: f.css }}>
            {f.label}
          </option>
        ))}
      </select>
      <span className="font-preview" style={{ fontFamily: fontCss(id) }}>
        Aa Bb Cc 123
      </span>
    </label>
  );
}
