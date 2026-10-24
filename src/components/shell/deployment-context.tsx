"use client";

import { createContext, useContext, type ReactNode } from "react";

export interface DeploymentInfo {
  /** Public portfolio deployment: routing is real, model execution is simulated. */
  portfolio: boolean;
  links: { github?: string; linkedin?: string };
}

const Ctx = createContext<DeploymentInfo>({ portfolio: false, links: {} });

export function DeploymentProvider({ value, children }: { value: DeploymentInfo; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDeployment() {
  return useContext(Ctx);
}
