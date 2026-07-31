"use client";

import React, { useState } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

type Intensity = "none" | "xs" | "sm" | "md" | "lg" | "xl";
type BlurIntensity = "sm" | "md" | "lg" | "xl";

interface LiquidGlassCardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  draggable?: boolean;
  expandable?: boolean;
  width?: string;
  height?: string;
  expandedWidth?: string;
  expandedHeight?: string;
  blurIntensity?: BlurIntensity;
  shadowIntensity?: Intensity;
  borderRadius?: string;
  glowIntensity?: Intensity;
}

const blurClasses: Record<BlurIntensity, string> = {
  sm: "backdrop-blur-sm",
  md: "backdrop-blur-md",
  lg: "backdrop-blur-lg",
  xl: "backdrop-blur-xl",
};

const shadowStyles: Record<Intensity, string> = {
  none: "inset 0 0 0 0 rgba(255, 255, 255, 0)",
  xs: "inset 1px 1px 1px 0 rgba(255, 255, 255, 0.3), inset -1px -1px 1px 0 rgba(255, 255, 255, 0.3)",
  sm: "inset 2px 2px 2px 0 rgba(255, 255, 255, 0.35), inset -2px -2px 2px 0 rgba(255, 255, 255, 0.35)",
  md: "inset 3px 3px 3px 0 rgba(255, 255, 255, 0.45), inset -3px -3px 3px 0 rgba(255, 255, 255, 0.45)",
  lg: "inset 4px 4px 4px 0 rgba(255, 255, 255, 0.5), inset -4px -4px 4px 0 rgba(255, 255, 255, 0.5)",
  xl: "inset 6px 6px 6px 0 rgba(255, 255, 255, 0.55), inset -6px -6px 6px 0 rgba(255, 255, 255, 0.55)",
};

const glowStyles: Record<Intensity, string> = {
  none: "0 4px 4px rgba(0, 0, 0, 0.05), 0 0 12px rgba(0, 0, 0, 0.05)",
  xs: "0 4px 4px rgba(0, 0, 0, 0.15), 0 0 12px rgba(0, 0, 0, 0.08), 0 0 16px rgba(255, 255, 255, 0.05)",
  sm: "0 4px 4px rgba(0, 0, 0, 0.15), 0 0 12px rgba(0, 0, 0, 0.08), 0 0 24px rgba(255, 255, 255, 0.1)",
  md: "0 4px 4px rgba(0, 0, 0, 0.15), 0 0 12px rgba(0, 0, 0, 0.08), 0 0 32px rgba(255, 255, 255, 0.15)",
  lg: "0 4px 4px rgba(0, 0, 0, 0.15), 0 0 12px rgba(0, 0, 0, 0.08), 0 0 40px rgba(255, 255, 255, 0.2)",
  xl: "0 4px 4px rgba(0, 0, 0, 0.15), 0 0 12px rgba(0, 0, 0, 0.08), 0 0 48px rgba(255, 255, 255, 0.25)",
};

export const LiquidGlassCard = ({
  children,
  className = "",
  draggable = true,
  expandable = false,
  width,
  height,
  expandedWidth,
  expandedHeight,
  blurIntensity = "xl",
  borderRadius = "32px",
  glowIntensity = "sm",
  shadowIntensity = "md",
  onClick,
  style,
}: LiquidGlassCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleToggleExpansion = (event: React.MouseEvent<HTMLDivElement>) => {
    if (onClick) onClick(event);
    if (!expandable) return;
    if (event.target instanceof Element && event.target.closest("a, button, input, select, textarea")) return;
    setIsExpanded((value) => !value);
  };

  const animatedSize = expandable
    ? {
        width: isExpanded ? expandedWidth || width || "auto" : width || "auto",
        height: isExpanded ? expandedHeight || height || "auto" : height || "auto",
      }
    : {};

  return (
    <motion.div
      className={cn(
        "relative",
        draggable && "cursor-grab active:cursor-grabbing",
        expandable && "cursor-pointer",
        className
      )}
      style={{
        borderRadius,
        width: !expandable ? width : undefined,
        height: !expandable ? height : undefined,
        ...style,
      }}
      animate={animatedSize}
      transition={{ duration: 0.4, ease: [0.5, 1.5, 0.5, 1] }}
      drag={draggable}
      dragConstraints={draggable ? { left: 0, right: 0, top: 0, bottom: 0 } : undefined}
      dragElastic={draggable ? 0.3 : undefined}
      dragTransition={draggable ? { bounceStiffness: 300, bounceDamping: 10, power: 0.3 } : undefined}
      whileDrag={draggable ? { scale: 1.02 } : undefined}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      onClick={handleToggleExpansion}
    >
      <div
        className={`absolute inset-0 ${blurClasses[blurIntensity]} z-0`}
        style={{ borderRadius, transform: "translateZ(0)" }}
      />
      <div className="absolute inset-0 z-10" style={{ borderRadius, boxShadow: glowStyles[glowIntensity] }} />
      <div className="absolute inset-0 z-20" style={{ borderRadius, boxShadow: shadowStyles[shadowIntensity] }} />
      <div className="relative z-30">{children}</div>
    </motion.div>
  );
};
