import React from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, G, Rect, Text as SvgText } from 'react-native-svg';
import { Category, CurrencyCode } from '../types';
import { formatMoney } from '../lib/finance';

interface DonutChartProps {
  data: Array<{ category: Category; total: number; color: string }>;
  currency: CurrencyCode;
}

export function DonutChart({ data, currency }: DonutChartProps) {
  const total = data.reduce((sum, item) => sum + item.total, 0);
  const size = 180;
  const strokeWidth = 24;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  if (total === 0) {
    return (
      <View style={styles.emptyChart}>
        <Text style={styles.emptyTitle}>No expense data yet</Text>
        <Text style={styles.emptyText}>Add expenses to generate spending insights.</Text>
      </View>
    );
  }

  const cx = size / 2;
  const cy = size / 2;

  return (
    <View style={styles.donutWrap}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <G transform={`rotate(-90, ${cx}, ${cy})`}>
          <Circle
            cx={cx}
            cy={cy}
            r={radius}
            stroke="#E2E8F0"
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          {data.map((item) => {
            const segment = (item.total / total) * circumference;
            const dashOffset = -offset;
            offset += segment;
            return (
              <Circle
                key={`donut_arc_${item.category}`}
                cx={cx}
                cy={cy}
                r={radius}
                stroke={item.color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                fill="transparent"
                strokeDasharray={`${segment} ${circumference - segment}`}
                strokeDashoffset={dashOffset}
              />
            );
          })}
        </G>
        <SvgText x={cx} y={cy - 8} textAnchor="middle" fontSize="12" fill="#64748B">
          This month
        </SvgText>
        <SvgText x={cx} y={cy + 16} textAnchor="middle" fontSize="17" fontWeight="700" fill="#0F172A">
          {formatMoney(total, currency)}
        </SvgText>
      </Svg>
      <View style={styles.legend}>
        {data.slice(0, 5).map((item) => (
          <View key={`donut_legend_${item.category}`} style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: item.color }]} />
            <Text style={styles.legendLabel}>{item.category}</Text>
            <Text style={styles.legendValue}>{formatMoney(item.total, currency)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

interface BarChartProps {
  data: Array<{ date: string; total: number }>;
  currency: CurrencyCode;
}

export function BarChart({ data, currency }: BarChartProps) {
  const { width: screenWidth } = useWindowDimensions();
  const chartWidth = Math.min(screenWidth - 72, 380);
  const max = Math.max(...data.map((item) => item.total), 1);
  const svgHeight = 150;
  const labelHeight = 28;
  const count = data.length;
  const gap = 10;
  const barWidth = Math.floor((chartWidth - gap * (count - 1)) / count);

  if (count === 0) {
    return (
      <View style={styles.emptyChart}>
        <Text style={styles.emptyTitle}>No data this week</Text>
        <Text style={styles.emptyText}>Expenses will appear here once logged.</Text>
      </View>
    );
  }

  return (
    <View style={styles.barWrap}>
      <Svg width={chartWidth} height={svgHeight + labelHeight} viewBox={`0 0 ${chartWidth} ${svgHeight + labelHeight}`}>
        {data.map((item, index) => {
          const barH = Math.max((item.total / max) * svgHeight, item.total > 0 ? 10 : 3);
          const x = index * (barWidth + gap);
          const y = svgHeight - barH;
          const label = new Intl.DateTimeFormat('en-US', { weekday: 'short' })
            .format(new Date(item.date))
            .toUpperCase();
          return (
            <G key={item.date}>
              <Rect x={x} y={0} width={barWidth} height={svgHeight} rx={10} fill="#EEF2FB" />
              <Rect x={x} y={y} width={barWidth} height={barH} rx={10} fill="#11479E" />
              <SvgText
                x={x + barWidth / 2}
                y={svgHeight + 20}
                textAnchor="middle"
                fontSize="10"
                fontWeight="700"
                fill="#8D99AF"
              >
                {label}
              </SvgText>
            </G>
          );
        })}
      </Svg>
      <Text style={styles.barHint}>Peak: {formatMoney(max, currency)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  donutWrap: {
    alignItems: 'center',
    gap: 16,
  },
  legend: {
    alignSelf: 'stretch',
    gap: 10,
  },
  legendRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  legendDot: {
    borderRadius: 6,
    height: 12,
    width: 12,
  },
  legendLabel: {
    color: '#334155',
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  legendValue: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
  },
  emptyChart: {
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    gap: 6,
    padding: 24,
  },
  emptyTitle: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '700',
  },
  emptyText: {
    color: '#64748B',
    fontSize: 13,
    textAlign: 'center',
  },
  barWrap: {
    gap: 8,
  },
  barHint: {
    color: '#64748B',
    fontSize: 12,
  },
});
