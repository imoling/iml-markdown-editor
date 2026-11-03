import { useEffect, useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { countDue, dueNotice } from '../../../electron/shared/tasks';
import { formatDate } from '../../utils/date';

const NOTICED_KEY = 'iml.tasks.noticed';

/**
 * 逾期和今天到期的待办有几件：待办图标上的数字。
 * 每天第一次看到有到期的事时提醒一句，不用等人想起来去翻。窗口重新拿到焦点时再数一遍，隔夜开着也对得上日期
 */
export function useDueCount(): number {
  const libraryVersion = useAppStore((s) => s.libraryVersion);
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () => {
      window.api.search.tasks(false).then((notes) => {
        if (!alive) return;
        const today = formatDate(new Date());
        const { overdue, due } = countDue(notes, today);
        setCount(overdue + due);
        if (overdue + due === 0 || localStorage.getItem(NOTICED_KEY) === today) return;
        localStorage.setItem(NOTICED_KEY, today);
        const { notify, openTodayTasks } = useAppStore.getState();
        notify(dueNotice(overdue, due), undefined, [{ label: '看看', run: openTodayTasks }]);
      }).catch(() => {});
    };
    load();
    window.addEventListener('focus', load);
    return () => { alive = false; window.removeEventListener('focus', load); };
  }, [libraryVersion]);

  return count;
}
