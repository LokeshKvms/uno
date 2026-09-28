import { AVATAR_TONES, initials } from "../lib/avatars.ts";

interface NameFieldsProps {
  id: string;
  name: string;
  avatar: number;
  onName: (v: string) => void;
  onAvatar: (v: number) => void;
  error?: string;
}

export function NameFields({ id, name, avatar, onName, onAvatar, error }: NameFieldsProps) {
  return (
    <div className="name-fields">
      <div className="field">
        <label className="field-label" htmlFor={id}>
          Your name
        </label>
        <input
          id={id}
          className="input"
          value={name}
          maxLength={20}
          onChange={(e) => onName(e.target.value)}
          placeholder="What should the table call you?"
          autoComplete="nickname"
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        {error && (
          <p id={`${id}-error`} className="field-error">
            {error}
          </p>
        )}
      </div>
      <div className="field">
        <span className="field-label" id={`${id}-avatar`}>
          Your color
        </span>
        <div className="avatar-picker" role="radiogroup" aria-labelledby={`${id}-avatar`}>
          {AVATAR_TONES.map((tone, i) => (
            <button
              key={tone}
              type="button"
              role="radio"
              aria-checked={avatar === i}
              aria-label={`Color ${i + 1}`}
              onClick={() => onAvatar(i)}
              style={{ background: tone }}
            >
              {avatar === i && <span aria-hidden="true">{initials(name || "You")}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
