import { describe, expect, it } from 'vitest';
import { describeLibrary, MAX_RECENT_LIBRARIES, normalizeRecentLibraries, touchRecentLibraries } from './recentLibraries';

describe('最近用过的笔记库', () => {
  it('当前的排第一；重复的、不是路径的去掉；末尾的斜杠不算不同', () => {
    expect(normalizeRecentLibraries(['/a', '/b/', '/a', '', null, 42, '/c'], '/b')).toEqual(['/b', '/a', '/c']);
    expect(normalizeRecentLibraries(undefined, '/only')).toEqual(['/only']);
    expect(normalizeRecentLibraries('坏了', '')).toEqual([]);
    expect(normalizeRecentLibraries(['C:\\Notes\\'], 'D:\\Work')).toEqual(['D:\\Work', 'C:\\Notes']);
  });

  it('第一次换库：名单还是空的，换之前的那个也要记下，不然回不去', () => {
    expect(touchRecentLibraries(undefined, '/old', '/new')).toEqual(['/new', '/old']);
  });

  it('换回名单里已有的：提到最前，不多出一条', () => {
    expect(touchRecentLibraries(['/b', '/a', '/c'], '/b', '/a')).toEqual(['/a', '/b', '/c']);
  });

  it('只留最近的几个', () => {
    const many = Array.from({ length: 20 }, (_, i) => `/lib-${i}`);
    const out = touchRecentLibraries(many, '/lib-0', '/new');
    expect(out).toHaveLength(MAX_RECENT_LIBRARIES);
    expect(out.slice(0, 3)).toEqual(['/new', '/lib-0', '/lib-1']);
  });

  it('给人看的：名字是最后一级，位置把用户目录缩成 ~', () => {
    expect(describeLibrary('/Users/kang/Documents/iML Notes')).toEqual({ name: 'iML Notes', where: '~/Documents' });
    expect(describeLibrary('/Users/kang/笔记/')).toEqual({ name: '笔记', where: '~' });
    expect(describeLibrary('/Volumes/Disk/工作')).toEqual({ name: '工作', where: '/Volumes/Disk' });
    expect(describeLibrary('C:\\Users\\kang\\Notes')).toEqual({ name: 'Notes', where: '~' });
    expect(describeLibrary('D:\\Work\\Notes')).toEqual({ name: 'Notes', where: 'D:\\Work' });
    expect(describeLibrary('/notes')).toEqual({ name: 'notes', where: '/' });
  });
});
