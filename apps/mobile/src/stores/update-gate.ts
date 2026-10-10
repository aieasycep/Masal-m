import { create } from 'zustand';

interface UpdateGateState {
  /** The API answered 426 / APP_VERSION_UNSUPPORTED — the app must be updated. */
  required: boolean;
  /** Lowest version the server still accepts, when it told us. */
  minSupportedVersion: string | null;
  require: (minSupportedVersion: string | null) => void;
}

/**
 * Update-required gate (§version gate). Flipped by the api client's
 * `onUpdateRequired`; the root layout swaps the navigator for the
 * full-screen UpdateRequired view while `required` is true. There is no
 * "dismiss" — only a newer build clears it.
 */
export const useUpdateGate = create<UpdateGateState>((set) => ({
  required: false,
  minSupportedVersion: null,
  require: (minSupportedVersion) =>
    set((state) => ({
      required: true,
      minSupportedVersion: minSupportedVersion ?? state.minSupportedVersion,
    })),
}));
