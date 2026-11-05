import React from 'react';
import { Button, DatePicker, Dropdown, Space } from 'antd';
import { CalendarDays, ChevronDown } from 'lucide-react';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

// Indian financial year runs 1 April - 31 March.
const fyStart = (d) => (d.month() >= 3 ? d.year() : d.year() - 1);
const quarterStart = (d) => d.startOf('month').month(Math.floor(d.month() / 3) * 3);

const buildPresets = () => {
  const today = dayjs();
  const fy = fyStart(today);
  return [
    { label: 'Today', value: [today.startOf('day'), today.endOf('day')] },
    { label: 'Yesterday', value: [today.subtract(1, 'day').startOf('day'), today.subtract(1, 'day').endOf('day')] },
    { label: 'This week', value: [today.startOf('week'), today.endOf('day')] },
    { label: 'Last 7 days', value: [today.subtract(6, 'day').startOf('day'), today.endOf('day')] },
    { label: 'This month', value: [today.startOf('month'), today.endOf('day')] },
    { label: 'Last month', value: [today.subtract(1, 'month').startOf('month'), today.subtract(1, 'month').endOf('month')] },
    { label: 'Last 30 days', value: [today.subtract(29, 'day').startOf('day'), today.endOf('day')] },
    { label: 'Last 90 days', value: [today.subtract(89, 'day').startOf('day'), today.endOf('day')] },
    { label: 'This quarter', value: [quarterStart(today), today.endOf('day')] },
    { label: `FY ${fy}-${String(fy + 1).slice(2)}`, value: [dayjs(`${fy}-04-01`), today.endOf('day')] },
    { label: `FY ${fy - 1}-${String(fy).slice(2)}`, value: [dayjs(`${fy - 1}-04-01`), dayjs(`${fy}-03-31`).endOf('day')] }
  ];
};

const sameDay = (a, b) => a && b && a.isSame(b, 'day');

/**
 * Date range picker with a small "Quick range" dropdown beside it (Today, This month, financial
 * year, ...). Picking a quick range applies it straight away. Same value / onChange as RangePicker.
 */
const DateRangeFilter = ({ value, onChange, placeholder = ['From date', 'To date'], style, ...rest }) => {
  const presets = buildPresets();
  const active = presets.find((p) => sameDay(p.value[0], value?.[0]) && sameDay(p.value[1], value?.[1]));
  const items = presets.map((p, i) => ({ key: String(i), label: p.label }));

  return (
    <Space.Compact style={{ display: 'flex', ...style }}>
      <Dropdown
        trigger={['click']}
        menu={{ items, selectable: true, selectedKeys: active ? [String(presets.indexOf(active))] : [], onClick: ({ key }) => onChange?.(presets[Number(key)].value) }}
      >
        <Button>
          <Space size={6}>{active ? active.label : 'Quick range'}<ChevronDown size={14} /></Space>
        </Button>
      </Dropdown>
      <RangePicker
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        format="DD MMM YYYY"
        allowClear
        placement="bottomLeft"
        suffixIcon={<CalendarDays size={15} />}
        style={{ flex: 1, minWidth: 260 }}
        {...rest}
      />
    </Space.Compact>
  );
};

export default DateRangeFilter;
