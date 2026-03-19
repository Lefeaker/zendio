interface RepositoryErrorOptions {
  cause?: unknown;
  context?: Record<string, unknown>;
}

export class RepositoryError extends Error {
  readonly context?: Record<string, unknown>;

  constructor(message: string, name: string, options?: RepositoryErrorOptions) {
    super(message);
    this.name = name;
    if (options?.context) {
      this.context = options.context;
    }
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

export class StorageError extends RepositoryError {
  constructor(message: string, options?: RepositoryErrorOptions) {
    super(message, 'StorageError', options);
  }
}

export class MessagingError extends RepositoryError {
  constructor(message: string, options?: RepositoryErrorOptions) {
    super(message, 'MessagingError', options);
  }
}
