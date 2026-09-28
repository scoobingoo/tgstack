declare module "virtual:dev-mock" {
  /** Mocks the Telegram environment in a normal browser (`vite dev` only). */
  export function mockEnvironmentForBrowserDev(): Promise<void>;
}
