"use client";

import {
  type ButtonHTMLAttributes,
  type ForwardRefExoticComponent,
  forwardRef,
  type HTMLAttributes,
  type RefAttributes,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { cn } from "@/lib/cn";

export interface AnimatedIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

export type AnimatedIconComponent = ForwardRefExoticComponent<
  HTMLAttributes<HTMLDivElement> & { size?: number } & RefAttributes<AnimatedIconHandle>
>;

/**
 * Drives a lucide-animated icon from a larger hover target (the whole button / row)
 * instead of only the tiny icon box.
 */
export function useAnimatedIconHover() {
  const iconRef = useRef<AnimatedIconHandle | null>(null);
  const start = useCallback(() => iconRef.current?.startAnimation(), []);
  const stop = useCallback(() => iconRef.current?.stopAnimation(), []);
  const hoverProps = useMemo(
    () => ({
      onMouseEnter: start,
      onMouseLeave: stop,
      onFocus: start,
      onBlur: stop,
    }),
    [start, stop]
  );
  return { iconRef, hoverProps, start, stop };
}

interface AnimatedIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: AnimatedIconComponent;
  iconSize?: number;
  iconClassName?: string;
}

/** A button whose whole surface triggers the embedded animated icon. */
export const AnimatedIconButton = forwardRef<HTMLButtonElement, AnimatedIconButtonProps>(
  function AnimatedIconButton(
    {
      icon: Icon,
      iconSize = 16,
      iconClassName,
      children,
      onMouseEnter,
      onMouseLeave,
      onFocus,
      onBlur,
      type = "button",
      ...props
    },
    ref
  ) {
    const { iconRef, start, stop } = useAnimatedIconHover();
    return (
      <button
        ref={ref}
        type={type}
        onMouseEnter={(e) => {
          start();
          onMouseEnter?.(e);
        }}
        onMouseLeave={(e) => {
          stop();
          onMouseLeave?.(e);
        }}
        onFocus={(e) => {
          start();
          onFocus?.(e);
        }}
        onBlur={(e) => {
          stop();
          onBlur?.(e);
        }}
        {...props}
      >
        <Icon
          ref={iconRef}
          size={iconSize}
          className={cn("pointer-events-none inline-flex shrink-0 items-center justify-center", iconClassName)}
        />
        {children}
      </button>
    );
  }
);
