export interface UiMountable<TMount = void, TUpdate = TMount, TResult = HTMLElement | void> {
  mount(context: TMount): TResult;
  update(context: TUpdate): TResult;
  destroy(): void;
}
