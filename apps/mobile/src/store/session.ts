import { create } from "zustand";

type S = { userId: string | null; role: "user" | "guardian"; profile: any | null };

export const useSession = create<S & { set: (p: Partial<S>) => void }>((set) => ({
  userId: null,
  role: "user",
  profile: null,
  set: (p) => set(p),
}));
