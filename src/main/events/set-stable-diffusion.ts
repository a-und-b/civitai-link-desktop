import { setSDType } from '../store/store';

export function eventSetStableDiffusion(_, type: string) {
  setSDType(type);
}
