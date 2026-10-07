/** 마지막으로 고른 모델. 보는 사람마다 다를 수 있어서 localStorage에 둠. */
const MODEL_KEY = "spread-sheet:ai-model";

export function loadModelPreference(): string | null {
  try {
    return localStorage.getItem(MODEL_KEY);
  } catch {
    return null;
  }
}

export function saveModelPreference(id: string): void {
  try {
    localStorage.setItem(MODEL_KEY, id);
  } catch {
    // 저장할 수 없어도(사생활 보호 모드 등) 지금 화면에서는 고른 모델을 그대로 씀.
  }
}
