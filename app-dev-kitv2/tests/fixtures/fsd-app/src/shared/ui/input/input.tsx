import type { InputHTMLAttributes } from "react";

export function Input(props: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, id, ...rest } = props;
  return (
    <label htmlFor={id}>
      {label}
      <input id={id} {...rest} />
    </label>
  );
}
