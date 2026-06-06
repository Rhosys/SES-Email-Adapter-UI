/** No account is selected — the user must complete onboarding or select an account first. */
export class NoCurrentAccountError {
  readonly message = 'No current account'
}

/** A required resource hasn't been loaded into the store yet. */
export class ResourceNotLoadedError {
  constructor(public readonly resource: string) {}
  get message() { return `${this.resource} not loaded` }
}
