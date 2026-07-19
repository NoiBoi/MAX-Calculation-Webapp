import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

interface InputWithSuffixProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly suffix: ReactNode;
}

export const InputWithSuffix = forwardRef<HTMLInputElement, InputWithSuffixProps>(
  function InputWithSuffix({ className = "", suffix, ...props }, ref) {
    return <span className="input-with-suffix" data-component="input-with-suffix">
      <input {...props} className={`input-with-suffix-control ${className}`.trim()} ref={ref} />
      <span aria-hidden="true" className="input-with-suffix-unit">{suffix}</span>
    </span>;
  },
);
