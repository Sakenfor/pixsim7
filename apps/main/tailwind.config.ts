import preset from '@pixsim7/shared.config'
import type { Config } from 'tailwindcss'

export default {
  presets: [preset as any],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/shared/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      animation: {
        'spin-slow': 'spin 8s linear infinite',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'pulse-subtle': 'pulse-subtle 2s ease-in-out infinite',
        'pulse-badge': 'pulse-badge 2.5s ease-in-out infinite',
        'float': 'float 3s ease-in-out infinite',
        'fade-in': 'fade-in 0.2s ease-out',
        'scale-in': 'scale-in 0.2s ease-out',
        'slide-in': 'slide-in 0.3s ease-out',
        'bounce-once': 'bounce-once 0.5s ease-out',
        'hover-pop': 'hover-pop 0.3s ease-out',
        'shake': 'shake 0.4s ease-in-out',
        'cube-wobble': 'cube-wobble 4s ease-in-out infinite',
        'cube-bounce': 'cube-bounce 0.5s cubic-bezier(.36,.07,.19,.97)',
        'cube-nudge': 'cube-nudge 0.6s cubic-bezier(.36,.07,.19,.97)',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { opacity: '0.5', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.05)' },
        },
        'pulse-subtle': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.85' },
        },
        'pulse-badge': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.15)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'slide-in': {
          '0%': { opacity: '0', transform: 'translateX(100%)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'bounce-once': {
          '0%, 100%': { transform: 'translateY(0)' },
          '25%': { transform: 'translateY(-10px)' },
          '50%': { transform: 'translateY(0)' },
          '75%': { transform: 'translateY(-5px)' },
        },
        'hover-pop': {
          '0%': { transform: 'scale(1)' },
          '40%': { transform: 'scale(1.18) translateY(-1px)' },
          '70%': { transform: 'scale(0.97)' },
          '100%': { transform: 'scale(1.08)' },
        },
        'shake': {
          '0%, 100%': { transform: 'translateX(0)' },
          '10%, 30%, 50%, 70%, 90%': { transform: 'translateX(-4px)' },
          '20%, 40%, 60%, 80%': { transform: 'translateX(4px)' },
        },
        'cube-wobble': {
          '0%, 100%': { transform: 'rotateX(0deg) rotateY(0deg) rotateZ(0deg)' },
          '25%': { transform: 'rotateX(2deg) rotateY(-3deg) rotateZ(1deg)' },
          '50%': { transform: 'rotateX(-1deg) rotateY(2deg) rotateZ(-1deg)' },
          '75%': { transform: 'rotateX(1deg) rotateY(-1deg) rotateZ(0.5deg)' },
        },
        'cube-bounce': {
          '0%': { transform: 'scale(1)' },
          '20%': { transform: 'scale(1.22) translateY(-2px)' },
          '40%': { transform: 'scale(0.92)' },
          '55%': { transform: 'scale(1.12) translateY(-1px)' },
          '70%': { transform: 'scale(0.97)' },
          '85%': { transform: 'scale(1.04)' },
          '100%': { transform: 'scale(1)' },
        },
        'cube-nudge': {
          '0%':   { transform: 'scale(1)',    boxShadow: '0 0 0 0 rgba(34,211,238,0)' },
          '25%':  { transform: 'scale(1.25)', boxShadow: '0 0 16px 4px rgba(34,211,238,0.4)' },
          '50%':  { transform: 'scale(0.95)', boxShadow: '0 0 8px 2px rgba(34,211,238,0.2)' },
          '75%':  { transform: 'scale(1.1)',  boxShadow: '0 0 12px 3px rgba(34,211,238,0.3)' },
          '100%': { transform: 'scale(1)',    boxShadow: '0 0 0 0 rgba(34,211,238,0)' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config
