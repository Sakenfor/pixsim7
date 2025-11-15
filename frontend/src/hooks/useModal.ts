import { useState, useCallback } from 'react';

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary';
}

interface PromptOptions {
  title?: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
}

export function useConfirmModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({ message: '' });
  const [resolveRef, setResolveRef] = useState<{ resolve: (value: boolean) => void } | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    setOptions(opts);
    setIsOpen(true);

    return new Promise((resolve) => {
      setResolveRef({ resolve });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    resolveRef?.resolve(true);
    setIsOpen(false);
  }, [resolveRef]);

  const handleCancel = useCallback(() => {
    resolveRef?.resolve(false);
    setIsOpen(false);
  }, [resolveRef]);

  return {
    confirm,
    isOpen,
    options,
    handleConfirm,
    handleCancel,
  };
}

export function usePromptModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<PromptOptions>({ message: '' });
  const [resolveRef, setResolveRef] = useState<{ resolve: (value: string | null) => void } | null>(null);

  const prompt = useCallback((opts: PromptOptions): Promise<string | null> => {
    setOptions(opts);
    setIsOpen(true);

    return new Promise((resolve) => {
      setResolveRef({ resolve });
    });
  }, []);

  const handleConfirm = useCallback((value: string) => {
    resolveRef?.resolve(value);
    setIsOpen(false);
  }, [resolveRef]);

  const handleCancel = useCallback(() => {
    resolveRef?.resolve(null);
    setIsOpen(false);
  }, [resolveRef]);

  return {
    prompt,
    isOpen,
    options,
    handleConfirm,
    handleCancel,
  };
}
