import { describe, it, expect, beforeEach } from 'vitest';
import { describeMics, cleanMicLabel, resolveMic, currentMicLabel, getPreferredMic, setPreferredMic, micPermission } from './micDevices';

const dev = (deviceId: string, label: string, kind: MediaDeviceKind = 'audioinput') => ({ deviceId, label, kind });

describe('收音设备', () => {
  beforeEach(() => localStorage.clear());

  it('设备名去掉 Chromium 加的前后缀', () => {
    expect(cleanMicLabel('Default - MacBook Pro Microphone (Built-in)')).toBe('MacBook Pro Microphone');
    expect(cleanMicLabel('默认 - 外置麦克风 (内建)')).toBe('外置麦克风');
    expect(cleanMicLabel('Logitech Webcam C270 (046d:0825)')).toBe('Logitech Webcam C270');
    expect(cleanMicLabel('AirPods Pro')).toBe('AirPods Pro');
  });

  it('default / communications 是别名，不单列；从别名读出系统当前用的是哪个', () => {
    const list = describeMics([
      dev('default', 'Default - AirPods Pro'), dev('communications', 'Communications - AirPods Pro'),
      dev('a1', 'MacBook Pro Microphone (Built-in)'), dev('b2', 'AirPods Pro'),
      dev('x', 'MacBook Pro Speakers', 'audiooutput'),
    ]);
    expect(list.systemDefault).toBe('AirPods Pro');
    expect(list.mics).toEqual([{ id: 'a1', label: 'MacBook Pro Microphone' }, { id: 'b2', label: 'AirPods Pro' }]);
    expect(list.labelsAvailable).toBe(true);
  });

  it('没授权之前读不到名字：给个占位的名字，并标明名字不可用', () => {
    const list = describeMics([dev('', ''), dev('a1', '')]);
    expect(list.labelsAvailable).toBe(false);
    expect(list.mics).toEqual([{ id: 'a1', label: '麦克风 1' }]);
    expect(currentMicLabel('', list)).toBe('');
  });

  it('授权状态：读不到不等于被拒绝；真的收到过声音，以事实为准', () => {
    expect(micPermission('granted', false)).toBe('ok');
    expect(micPermission('not-determined', false)).toBe('ask');
    expect(micPermission('denied', false)).toBe('blocked');
    expect(micPermission('restricted', false)).toBe('blocked');
    // 主进程还是没有这个字段的旧版本（界面热更新了、主进程没重启）、或平台没有这道关
    expect(micPermission(undefined, false)).toBe('ok');
    expect(micPermission('unknown', false)).toBe('ok');
    // 系统 API 说拒绝，但刚刚明明录到了声音
    expect(micPermission('denied', true)).toBe('ok');
  });

  it('选的那个拔掉了就暂时跟随系统，但不忘掉用户的选择', () => {
    const list = describeMics([dev('default', 'Default - MacBook Pro Microphone'), dev('a1', 'MacBook Pro Microphone')]);
    setPreferredMic('usb-9');
    expect(resolveMic(getPreferredMic(), list)).toEqual({ deviceId: '', missing: true });
    expect(currentMicLabel('usb-9', list)).toBe('MacBook Pro Microphone');
    expect(getPreferredMic()).toBe('usb-9');
    expect(resolveMic('a1', list)).toEqual({ deviceId: 'a1', missing: false });
    setPreferredMic('');
    expect(getPreferredMic()).toBe('');
    expect(resolveMic('', list)).toEqual({ deviceId: '', missing: false });
  });
});

describe('系统声音当作一路收音设备', () => {
  it('选了「system」：不算设备丢了，面板上显示「系统声音」', async () => {
    const { resolveMic, currentMicLabel, SYSTEM_AUDIO_ID } = await import('./micDevices');
    const list = { systemDefault: 'MacBook Air 麦克风', mics: [{ id: 'abc', label: 'USB 麦' }], labelsAvailable: true };
    expect(resolveMic(SYSTEM_AUDIO_ID, list)).toEqual({ deviceId: 'system', missing: false });
    expect(currentMicLabel(SYSTEM_AUDIO_ID, list)).toBe('系统声音');
    expect(currentMicLabel('', list)).toBe('MacBook Air 麦克风');
  });
});
