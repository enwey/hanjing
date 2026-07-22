function getTodayText() {
  const today = new Date();
  return (
    today.getFullYear() +
    '-' +
    String(today.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(today.getDate()).padStart(2, '0')
  );
}

Component({
  properties: {
    dates: {
      type: Array,
      value: [],
    },
    selectedDate: {
      type: String,
      value: '',
    },
  },
  data: {
    currentYear: new Date().getFullYear(),
    currentMonth: new Date().getMonth(),
    monthTitle: '',
    weekdays: ['日', '一', '二', '三', '四', '五', '六'],
    calendarDays: [],
  },
  lifetimes: {
    attached() {
      this.syncMonthBySelectedDate(this.properties.selectedDate);
      this.rebuildCalendarDays();
    },
  },
  observers: {
    'dates, selectedDate': function updateCalendar(dates, selectedDate) {
      this.syncMonthBySelectedDate(selectedDate);
      this.rebuildCalendarDays(dates, selectedDate);
    },
  },
  methods: {
    syncMonthBySelectedDate(selectedDate) {
      if (!selectedDate) {
        return;
      }
      const [year, month] = String(selectedDate).split('-').map(Number);
      if (year && month) {
        this.setData({
          currentYear: year,
          currentMonth: month - 1,
        });
      }
    },
    rebuildCalendarDays(inputDates, selectedDate) {
      const currentYear = this.data.currentYear;
      const currentMonth = this.data.currentMonth;
      const dates = Array.isArray(inputDates) ? inputDates : this.properties.dates || [];
      const selected = selectedDate !== undefined ? selectedDate : this.properties.selectedDate;
      const todayText = getTodayText();
      const firstDayOffset = new Date(currentYear, currentMonth, 1).getDay();
      const monthDayCount = new Date(currentYear, currentMonth + 1, 0).getDate();
      const calendarDays = [];

      for (let index = 0; index < firstDayOffset; index += 1) {
        calendarDays.push({
          date: '',
          day: 0,
          isToday: false,
          isPast: false,
          hasSchedule: false,
          disabled: true,
          isSelected: false,
          isEmpty: true,
          isTodayUnbookable: false,
        });
      }

      for (let day = 1; day <= monthDayCount; day += 1) {
        const dateText =
          currentYear +
          '-' +
          String(currentMonth + 1).padStart(2, '0') +
          '-' +
          String(day).padStart(2, '0');
        const isToday = dateText === todayText;
        const hasSchedule = dates.includes(dateText);
        const isPast = dateText < todayText;
        const disabled = isPast || !hasSchedule;
        calendarDays.push({
          date: dateText,
          day,
          isToday,
          isPast,
          hasSchedule,
          disabled,
          isSelected: dateText === selected,
          isEmpty: false,
          isTodayUnbookable: isToday && !hasSchedule,
        });
      }

      this.setData({
        monthTitle: currentYear + '年' + (currentMonth + 1) + '月',
        calendarDays,
      });
    },
    goPrevMonth() {
      const currentMonth = this.data.currentMonth;
      const currentYear = this.data.currentYear;
      if (currentMonth === 0) {
        this.setData({
          currentYear: currentYear - 1,
          currentMonth: 11,
        });
      } else {
        this.setData({
          currentMonth: currentMonth - 1,
        });
      }
      this.rebuildCalendarDays();
    },
    goNextMonth() {
      const currentMonth = this.data.currentMonth;
      const currentYear = this.data.currentYear;
      if (currentMonth === 11) {
        this.setData({
          currentYear: currentYear + 1,
          currentMonth: 0,
        });
      } else {
        this.setData({
          currentMonth: currentMonth + 1,
        });
      }
      this.rebuildCalendarDays();
    },
    handleDayTap(event) {
      const date = event.currentTarget.dataset.date || '';
      const disabled = Boolean(event.currentTarget.dataset.disabled);
      if (!date || disabled) {
        return;
      }
      this.triggerEvent('select', date);
    },
  },
});
