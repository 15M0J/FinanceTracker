import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { BarChart } from './src/components/Charts';
import { SecurityGate } from './src/components/SecurityGate';
import { CURRENCY_OPTIONS, EXPENSE_CATEGORIES } from './src/constants';
import { shortDate, toDateInputValue } from './src/lib/date';
import { exportTransactionsCsv } from './src/lib/export';
import {
  createSeedData,
  formatMoney,
  getBudgetUsage,
  getCategoryTotals,
  getDailyExpenseTotals,
  getTotals,
  processRecurringTransactions,
} from './src/lib/finance';
import { createId } from './src/lib/id';
import { loadFinanceData, saveFinanceData, saveSecurityState } from './src/lib/storage';
import {
  BudgetPeriod,
  BudgetUsage,
  Category,
  CurrencyCode,
  FinanceData,
  RecurringFrequency,
  Transaction,
  TransactionType,
} from './src/types';

type MainTab = 'overview' | 'budgets' | 'insights' | 'settings';

type Route =
  | { name: 'tabs'; tab: MainTab }
  | { name: 'add-transaction' }
  | { name: 'allocation' }
  | { name: 'allocation-list' }
  | { name: 'ledger'; category: Category | 'all' }
  | { name: 'categories' }
  | { name: 'change-password' };

type AddMode = 'manual' | 'capture' | 'upload';

const COLOR = {
  background: '#F4F7FC',
  card: '#FFFFFF',
  primary: '#11479E',
  primaryDark: '#0B356F',
  primarySoft: '#DDE7FF',
  text: '#1F2430',
  textSoft: '#7D879C',
  border: '#E7ECF5',
  green: '#48D7A1',
  greenDark: '#0D6B4A',
  red: '#D92D2A',
  redSoft: '#FFD7D3',
  yellow: '#FFE783',
};

const CATEGORY_META: Record<
  Category,
  {
    label: string;
    ledgerTitle: string;
    icon: keyof typeof Ionicons.glyphMap;
    accent: string;
    progress: string;
  }
> = {
  Food: { label: 'Food', ledgerTitle: 'Dining Out', icon: 'restaurant-outline', accent: '#DFF0FF', progress: '#D92D2A' },
  Transport: {
    label: 'Travel',
    ledgerTitle: 'Transport',
    icon: 'car-sport-outline',
    accent: '#E9EEFF',
    progress: '#11479E',
  },
  Salary: { label: 'Salary', ledgerTitle: 'Salary', icon: 'cash-outline', accent: '#EAF8F0', progress: '#48D7A1' },
  Rent: { label: 'Home', ledgerTitle: 'Housing', icon: 'home-outline', accent: '#E9EEFF', progress: '#11479E' },
  Bills: { label: 'Utilities', ledgerTitle: 'Utilities', icon: 'flash-outline', accent: '#EAF8F0', progress: '#D92D2A' },
  Shopping: { label: 'Shop', ledgerTitle: 'Shopping', icon: 'bag-handle-outline', accent: '#F2F5FF', progress: '#11479E' },
  Health: {
    label: 'Health',
    ledgerTitle: 'Health & Fitness',
    icon: 'fitness-outline',
    accent: '#EAF8F0',
    progress: '#11479E',
  },
  Savings: {
    label: 'Investments',
    ledgerTitle: 'Investment',
    icon: 'cash-outline',
    accent: '#EAF8F0',
    progress: '#48D7A1',
  },
  Other: { label: 'Other', ledgerTitle: 'Other', icon: 'ellipsis-horizontal', accent: '#F2F5FF', progress: '#11479E' },
};

const TAB_ITEMS: Array<{ key: MainTab; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: 'overview', label: 'OVERVIEW', icon: 'apps-outline' },
  { key: 'budgets', label: 'BUDGETS', icon: 'wallet-outline' },
  { key: 'insights', label: 'INSIGHTS', icon: 'analytics-outline' },
  { key: 'settings', label: 'SETTINGS', icon: 'settings-outline' },
];

const initialTransactionForm = {
  type: 'expense' as TransactionType,
  amount: '',
  category: 'Food' as Category,
  note: '',
  date: toDateInputValue(),
  contact: '',
  addRecurring: false,
  recurringFrequency: 'monthly' as RecurringFrequency,
};

const initialAllocationForm = {
  amount: '',
  category: 'Food' as Category,
  notes: '',
  period: 'weekly' as BudgetPeriod,
  date: toDateInputValue(),
  recurring: false,
  thresholdAlert: true,
};

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isSmallPhone = screenWidth < 360;
  const isCompactPhone = screenWidth < 400;
  const isShortPhone = screenHeight < 760;
  const isTablet = screenWidth >= 600;
  const [data, setData] = useState<FinanceData | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [route, setRoute] = useState<Route>({ name: 'tabs', tab: 'overview' });
  const [notice, setNotice] = useState('');
  const [fabOpen, setFabOpen] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>('manual');
  const [txForm, setTxForm] = useState(initialTransactionForm);
  const [allocationForm, setAllocationForm] = useState(initialAllocationForm);
  const [categoryFilter, setCategoryFilter] = useState<Category | 'all'>('all');
  const [insightRange, setInsightRange] = useState<'daily' | 'weekly' | 'monthly'>('monthly');

  useEffect(() => {
    let mounted = true;

    async function boot() {
      const stored = await loadFinanceData();
      const base = stored ?? createSeedData();
      const processed = processRecurringTransactions(base);

      if (!mounted) {
        return;
      }

      setData(processed.data);
      setUnlocked(!processed.data.settings.lockDashboard);

      if (processed.createdCount > 0) {
        setNotice(`${processed.createdCount} recurring transaction${processed.createdCount === 1 ? '' : 's'} posted.`);
        await saveFinanceData(processed.data);
      } else if (!stored) {
        await saveFinanceData(processed.data);
      }
    }

    boot().catch(() => {
      Alert.alert('Startup error', 'Unable to load local finance data.');
    });

    return () => {
      mounted = false;
    };
  }, []);

  const totals = useMemo(() => getTotals(data?.transactions ?? []), [data]);
  const categoryTotals = useMemo(() => getCategoryTotals(data?.transactions ?? []), [data]);
  const dailyTotals = useMemo(() => getDailyExpenseTotals(data?.transactions ?? []), [data]);
  const budgetUsage = useMemo(
    () => (data ? data.budgets.map((budget) => getBudgetUsage(budget, data.transactions)) : []),
    [data],
  );

  if (!data) {
    return (
      <View style={[styles.loadingScreen, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <ActivityIndicator color={COLOR.primary} size="large" />
        <Text style={styles.loadingText}>Preparing your finance dashboard...</Text>
      </View>
    );
  }

  if (data.settings.lockDashboard && !unlocked) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <SecurityGate onVerified={handleVerified} />
      </SafeAreaProvider>
    );
  }

  const finance = data;
  const currency = finance.settings.currency;
  const bottomInset = insets.bottom;
  const topInset = insets.top;
  const pageSideInset = isTablet ? 32 : isSmallPhone ? 16 : isCompactPhone ? 18 : 20;
  const navItemHeight = isCompactPhone ? 44 : 48;
  const navPaddingTop = 10;
  const navPaddingBottom = bottomInset + 6;
  const bottomNavHeight = navPaddingTop + navItemHeight + navPaddingBottom;
  const overviewContentBottomPadding = bottomNavHeight + 80;
  const tabContentBottomPadding = bottomNavHeight + 32;
  const subPageFooterPadding = 80 + bottomInset;
  const subPageContentPaddingBottom = subPageFooterPadding + 20;
  const maxContentWidth = isTablet ? Math.min(screenWidth, 560) : screenWidth;
  const numberPadKeyWidth = Math.max(Math.floor((maxContentWidth - pageSideInset * 2 - 24) / 3), 72);
  const numberPadKeyHeight = Math.max(Math.round(numberPadKeyWidth * 0.78), 64);
  const categoryTileWidth = Math.max(Math.floor((screenWidth - pageSideInset * 2 - 36 - 24) / 3), 72);
  const visibleBudgets = categoryFilter === 'all' ? budgetUsage : budgetUsage.filter((item) => item.budget.category === categoryFilter);
  const allocationCards = buildAllocationCards(visibleBudgets, categoryTotals);
  const filteredTransactions = route.name === 'ledger' ? filterTransactions(finance.transactions, route.category) : [];

  return (
    <View style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={topInset}
        style={styles.root}
      >
        {notice ? (
          <Pressable accessibilityRole="button" onPress={() => setNotice('')} style={[styles.noticeBar, { paddingTop: topInset + 8 }]}>
            <Ionicons name="checkmark-circle" size={18} color={COLOR.primary} />
            <Text style={styles.noticeText}>{notice}</Text>
          </Pressable>
        ) : null}

        {renderCurrentScreen()}

        {route.name === 'tabs' ? (
          <>
            {route.tab === 'overview' ? renderFab() : null}
            <BottomNav
              activeTab={route.tab}
              navPaddingTop={navPaddingTop}
              navPaddingBottom={navPaddingBottom}
              compact={isCompactPhone}
              onChange={(tab) => {
                setFabOpen(false);
                setRoute({ name: 'tabs', tab });
              }}
            />
          </>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );

  function renderCurrentScreen() {
    switch (route.name) {
      case 'add-transaction':
        return renderAddTransactionScreen();
      case 'allocation':
        return renderAllocationScreen();
      case 'allocation-list':
        return renderAllocationListScreen();
      case 'ledger':
        return renderLedgerScreen(filteredTransactions);
      case 'categories':
        return renderCategoriesScreen();
      case 'change-password':
        return renderPasswordScreen();
      case 'tabs':
        switch (route.tab) {
          case 'budgets':
            return renderBudgetsScreen();
          case 'insights':
            return renderInsightsScreen();
          case 'settings':
            return renderSettingsScreen();
          default:
            return renderOverviewScreen();
        }
    }
  }

  async function updateData(next: FinanceData) {
    setData(next);
    await saveFinanceData(next);
  }

  async function handleVerified(method: string) {
    setUnlocked(true);
    await saveSecurityState({ lastUnlockedAt: new Date().toISOString(), method });
  }

  async function saveTransaction() {
    const amount = Number(txForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Check amount', 'Enter a valid amount greater than zero.');
      return;
    }

    const nextTransactions: Transaction[] = [
      {
        id: createId('tx'),
        type: txForm.type,
        amount,
        category: txForm.category,
        note: txForm.note.trim() || txForm.contact.trim() || CATEGORY_META[txForm.category].ledgerTitle,
        date: txForm.date || toDateInputValue(),
        createdAt: new Date().toISOString(),
      },
      ...finance.transactions,
    ];

    const next: FinanceData = {
      ...finance,
      transactions: nextTransactions,
      recurring: txForm.addRecurring
        ? [
            {
              id: createId('rec'),
              type: txForm.type,
              amount,
              category: txForm.category,
              note: txForm.note.trim() || txForm.contact.trim() || CATEGORY_META[txForm.category].ledgerTitle,
              frequency: txForm.recurringFrequency,
              nextRunAt: txForm.date || toDateInputValue(),
              active: true,
              createdAt: new Date().toISOString(),
            },
            ...finance.recurring,
          ]
        : finance.recurring,
    };

    await updateData(next);
    setTxForm(initialTransactionForm);
    setAddMode('manual');
    setNotice('Transaction saved.');
    setRoute({ name: 'tabs', tab: 'overview' });
  }

  async function saveAllocation() {
    const amount = Number(allocationForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Check amount', 'Enter a valid allocation amount greater than zero.');
      return;
    }

    const withoutDuplicate = finance.budgets.filter(
      (budget) => !(budget.category === allocationForm.category && budget.period === allocationForm.period),
    );

    const next: FinanceData = {
      ...finance,
      budgets: [
        {
          id: createId('budget'),
          category: allocationForm.category,
          amount,
          period: allocationForm.period,
          createdAt: new Date().toISOString(),
        },
        ...withoutDuplicate,
      ],
      recurring: allocationForm.recurring
        ? [
            {
              id: createId('rec'),
              type: 'expense' as TransactionType,
              amount,
              category: allocationForm.category,
              note: allocationForm.notes.trim() || `${CATEGORY_META[allocationForm.category].ledgerTitle} allocation`,
              frequency: (allocationForm.period === 'weekly' ? 'weekly' : 'monthly') as RecurringFrequency,
              nextRunAt: allocationForm.date,
              active: true,
              createdAt: new Date().toISOString(),
            },
            ...finance.recurring,
          ]
        : finance.recurring,
    };

    await updateData(next);
    setAllocationForm(initialAllocationForm);
    setNotice('Allocation saved.');
    setRoute({ name: 'tabs', tab: 'budgets' });
  }

  async function cycleCurrency() {
    const index = CURRENCY_OPTIONS.findIndex((item) => item.code === currency);
    const next = CURRENCY_OPTIONS[(index + 1) % CURRENCY_OPTIONS.length];
    await updateData({ ...finance, settings: { ...finance.settings, currency: next.code } });
  }

  async function toggleBiometric(value: boolean) {
    await updateData({ ...finance, settings: { ...finance.settings, lockDashboard: value } });
    if (!value) {
      setUnlocked(true);
    }
  }

  async function handleExport() {
    try {
      const uri = await exportTransactionsCsv(finance);
      Alert.alert('Export ready', `CSV saved locally at ${uri}`);
    } catch {
      Alert.alert('Export failed', 'Unable to create a CSV export on this device.');
    }
  }

  function appendTransactionAmount(value: string) {
    setTxForm((current) => ({ ...current, amount: appendAmountValue(current.amount, value) }));
  }

  function backspaceTransactionAmount() {
    setTxForm((current) => ({ ...current, amount: current.amount.slice(0, -1) }));
  }

  function appendAllocationAmount(value: string) {
    setAllocationForm((current) => ({ ...current, amount: appendAmountValue(current.amount, value) }));
  }

  function backspaceAllocationAmount() {
    setAllocationForm((current) => ({ ...current, amount: current.amount.slice(0, -1) }));
  }

  function openExpenseEntry() {
    setTxForm({ ...initialTransactionForm, type: 'expense' });
    setFabOpen(false);
    setRoute({ name: 'add-transaction' });
  }

  function openIncomeEntry() {
    setTxForm({ ...initialTransactionForm, type: 'income', category: 'Salary' });
    setFabOpen(false);
    setRoute({ name: 'add-transaction' });
  }

  function goBack() {
    setRoute({ name: 'tabs', tab: route.name === 'tabs' ? route.tab : 'overview' });
  }

  function renderOverviewScreen() {
    const isCompactOverview = isCompactPhone || screenHeight < 820;
    const overviewSideInset = pageSideInset;
    const overviewAllocationWidth = Math.min(
      isTablet ? 200 : isSmallPhone ? 148 : 162,
      Math.max(maxContentWidth * 0.42, isSmallPhone ? 130 : 142),
    );
    const recentTransactions = finance.transactions.slice(0, 5);
    const portfolioValue = totals.income - totals.expenses;
    const netChange = totals.income > 0 ? ((totals.income - totals.expenses) / totals.income) * 100 : 0;
    const activeSpend = totals.expenses;
    const inflow = totals.income;
    const overviewAllocations = allocationCards.slice(0, 4).map((item) => ({
      ...item,
      title: CATEGORY_META[item.category].ledgerTitle,
      icon: CATEGORY_META[item.category].icon,
    }));
    const chartStartDate = dailyTotals.length > 0 ? monthLabel(dailyTotals[0].date) : monthLabel(new Date().toISOString());
    const chartEndDate = dailyTotals.length > 0 ? monthLabel(dailyTotals[dailyTotals.length - 1].date) : monthLabel(new Date().toISOString());

    return (
      <ScrollView
        contentContainerStyle={[
          styles.pageContent,
          styles.overviewContent,
          isCompactOverview && styles.overviewContentCompact,
          { paddingBottom: overviewContentBottomPadding, paddingHorizontal: overviewSideInset, paddingTop: topInset + 6 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <MainHeader onBellPress={() => setNotice('Notifications are up to date.')} />>

        <View style={[styles.heroCard, styles.portfolioHeroCard, isCompactOverview && styles.portfolioHeroCardCompact]}>
          <View style={[StyleSheet.absoluteFillObject, { borderRadius: 28, overflow: 'hidden' }]}>
            <PortfolioHeroBackground />
          </View>
          <View style={styles.portfolioHeroHeader}>
            <Text style={styles.heroEyebrowGlass}>Total Balance</Text>
            <View style={styles.portfolioTrendPill}>
              <Ionicons name={netChange >= 0 ? "trending-up-outline" : "trending-down-outline"} size={14} color={netChange >= 0 ? COLOR.green : COLOR.redSoft} />
              <Text style={[styles.portfolioTrendText, netChange < 0 && { color: COLOR.redSoft }]}>{netChange > 0 ? '+' : ''}{netChange.toFixed(1)}%</Text>
            </View>
          </View>
          <Text
            adjustsFontSizeToFit
            numberOfLines={1}
            style={[styles.heroAmount, styles.portfolioHeroAmount, isCompactOverview && styles.heroAmountCompact]}
          >
            {formatPortfolioMoney(portfolioValue, currency)}
          </Text>

          <View style={styles.portfolioInsightRow}>
            <View style={[styles.portfolioInsightCard, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
               <View style={styles.insightIconWrapGreen}>
                 <Ionicons name="arrow-down" size={14} color={COLOR.green} />
               </View>
               <View style={{ flex: 1 }}>
                 <Text style={styles.portfolioInsightLabel}>Income</Text>
                 <Text adjustsFontSizeToFit numberOfLines={1} style={styles.portfolioInsightValue}>
                   {formatSimpleMoney(inflow, currency)}
                 </Text>
               </View>
            </View>
            <View style={[styles.portfolioInsightCard, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
               <View style={styles.insightIconWrapRed}>
                 <Ionicons name="arrow-up" size={14} color={COLOR.redSoft} />
               </View>
               <View style={{ flex: 1 }}>
                 <Text style={styles.portfolioInsightLabel}>Expenses</Text>
                 <Text adjustsFontSizeToFit numberOfLines={1} style={styles.portfolioInsightValue}>
                   {formatSimpleMoney(activeSpend, currency)}
                 </Text>
               </View>
            </View>
          </View>
        </View>

        <View style={styles.quickActionRow}>
          <Pressable accessibilityRole="button" onPress={openIncomeEntry} style={styles.quickActionBtn}>
            <View style={[styles.quickActionIcon, { backgroundColor: '#E8F5E9' }]}>
              <Ionicons name="add" size={24} color={COLOR.greenDark} />
            </View>
            <Text style={styles.quickActionText}>Deposit</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={openExpenseEntry} style={styles.quickActionBtn}>
            <View style={[styles.quickActionIcon, { backgroundColor: '#FFEBEE' }]}>
              <Ionicons name="remove" size={24} color={COLOR.red} />
            </View>
            <Text style={styles.quickActionText}>Withdraw</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setRoute({ name: 'allocation' })} style={styles.quickActionBtn}>
            <View style={[styles.quickActionIcon, { backgroundColor: '#E3F2FD' }]}>
              <Ionicons name="wallet-outline" size={24} color={COLOR.primary} />
            </View>
            <Text style={styles.quickActionText}>Budget</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setRoute({ name: 'tabs', tab: 'insights' })} style={styles.quickActionBtn}>
            <View style={[styles.quickActionIcon, { backgroundColor: '#F3E5F5' }]}>
              <Ionicons name="pie-chart-outline" size={24} color="#8E24AA" />
            </View>
            <Text style={styles.quickActionText}>Insights</Text>
          </Pressable>
        </View>

        <SectionHeader title="Allocations" action="View All" onPress={() => setRoute({ name: 'allocation-list' })} />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[
            styles.horizontalList,
            styles.overviewHorizontalList,
            isCompactOverview && styles.overviewHorizontalListCompact,
            { paddingRight: overviewSideInset },
          ]}
        >
          {overviewAllocations.map((item, index) => (
            <Pressable
              accessibilityRole="button"
              key={`alloc_${item.category}_${index}`}
              onPress={() => setRoute({ name: 'ledger', category: item.category })}
              style={[
                styles.allocationCard,
                styles.overviewAllocationCard,
                isCompactOverview && styles.overviewAllocationCardCompact,
                { width: overviewAllocationWidth },
              ]}
            >
              <CategoryBadge category={item.category} iconOverride={item.icon} />
              <Text style={styles.allocationTitle}>{item.title}</Text>
              <Text style={styles.allocationValue}>{formatSimpleMoney(item.spent, currency)}</Text>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${item.percent}%`, backgroundColor: item.progressColor }]} />
              </View>
              <Text style={[styles.allocationLeft, item.left < 0 && styles.negativeText]}>
                {item.left >= 0 ? `${formatSimpleMoney(item.left, currency)} LEFT` : `${formatSimpleMoney(Math.abs(item.left), currency)} OVER`}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={[styles.card, styles.overviewTrendCard, isCompactOverview && styles.overviewTrendCardCompact]}>
          <View style={styles.chartTitleRow}>
            <View>
              <Text style={styles.cardTitle}>Spending Trend</Text>
              <Text style={styles.cardCaption}>{chartStartDate} - {chartEndDate}, {new Date().getFullYear()}</Text>
            </View>
            <View style={styles.chartDots}>
              <View style={[styles.chartDot, styles.chartDotActive]} />
              <View style={styles.chartDot} />
            </View>
          </View>
          <TrendChart />
        </View>

        <SectionHeader title="Recent Ledger" action="VIEW ALL" onPress={() => setRoute({ name: 'ledger', category: 'all' })} />
        <View style={[styles.stackList, styles.overviewLedgerList, isCompactOverview && styles.overviewLedgerListCompact]}>
          {recentTransactions.map((item) => (
            <LedgerRow
              amount={item.amount}
              category={item.category}
              currency={currency}
              date={item.date}
              note={item.note}
              time={formatTime(item.createdAt)}
              type={item.type}
              key={item.id}
              onPress={() => setRoute({ name: 'ledger', category: item.category })}
            />
          ))}
        </View>
      </ScrollView>
    );
  }

  function renderBudgetsScreen() {
    const activeBudgetCap = Math.max(sumBudgetCap(budgetUsage), 1);
    const remainingBudget = activeBudgetCap - totals.expenses;
    const budgetUsageShare = Math.min((totals.expenses / activeBudgetCap) * 100, 100);
    const burnPaceLabel = budgetUsageShare > 85 ? 'High burn pace' : budgetUsageShare > 65 ? 'Watch pacing' : 'Stable pacing';

    return (
      <ScrollView contentContainerStyle={[styles.pageContent, { paddingBottom: tabContentBottomPadding, paddingHorizontal: pageSideInset, paddingTop: topInset + 6 }]} showsVerticalScrollIndicator={false}>
        <MainHeader onBellPress={() => setNotice('Budget alerts refreshed.')} />
        <View style={[styles.heroCard, styles.budgetHeroCard, isCompactPhone && styles.budgetHeroCardCompact, { marginBottom: 32 }]}>
          <View style={[StyleSheet.absoluteFillObject, { borderRadius: 28, overflow: 'hidden' }]}>
            <BurnHeroBackground />
          </View>
          <View style={styles.budgetHeroHeader}>
            <View style={styles.budgetHeroIntro}>
              <Text style={styles.heroEyebrow}>MONTHLY BURN</Text>
              <Text style={styles.budgetHeroThreshold}>Threshold {formatMoney(activeBudgetCap, currency)}</Text>
            </View>
            <View style={styles.budgetHeroStatusWrap}>
              <StatusChip tone={budgetUsageShare > 85 ? 'danger' : 'success'} label={budgetUsageShare > 85 ? 'AT LIMIT' : 'ON TRACK'} />
            </View>
          </View>
          <View style={styles.budgetHeroAmountRow}>
            <Text style={[styles.heroAmount, styles.budgetHeroAmount, isCompactPhone && styles.heroAmountCompact]}>
              {formatMoney(totals.expenses, currency)}
            </Text>
            <View style={styles.budgetHeroPercentBadge}>
              <Text style={styles.budgetHeroPercentValue}>{Math.round(budgetUsageShare)}%</Text>
              <Text style={styles.budgetHeroPercentLabel}>USED</Text>
            </View>
          </View>
          <View style={styles.budgetHeroProgressWrap}>
            <View style={styles.heroProgressTrack}>
              <View style={[styles.heroProgressFill, { width: `${Math.max(budgetUsageShare, 8)}%` }]} />
            </View>
            <View style={styles.budgetHeroTrackGlow} />
          </View>
          <View style={[styles.budgetHeroMetricRow, isSmallPhone && styles.budgetHeroMetricRowCompact]}>
            <View style={styles.budgetHeroMetricCard}>
              <Text style={styles.budgetHeroMetricLabel}>Budget used</Text>
              <Text style={styles.budgetHeroMetricValue}>{Math.round(budgetUsageShare)}%</Text>
            </View>
            <View style={styles.budgetHeroMetricCard}>
              <Text style={styles.budgetHeroMetricLabel}>{remainingBudget >= 0 ? 'Remaining' : 'Over by'}</Text>
              <Text numberOfLines={1} adjustsFontSizeToFit style={styles.budgetHeroMetricValue}>
                {formatMoney(Math.abs(remainingBudget), currency)}
              </Text>
            </View>
            <View style={[styles.budgetHeroMetricCard, styles.budgetHeroMetricCardWide]}>
              <Text style={styles.budgetHeroMetricLabel}>Burn pace</Text>
              <Text style={styles.budgetHeroMetricValueSmall}>{burnPaceLabel}</Text>
            </View>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.categoryScroller, { paddingRight: pageSideInset }]} style={styles.categoryScrollerWrap}>
          <BudgetCategoryPill active={categoryFilter === 'all'} icon="apps-outline" label="All" onPress={() => setCategoryFilter('all')} />
          {EXPENSE_CATEGORIES.map((category, index) => (
            <BudgetCategoryPill active={categoryFilter === category} icon={CATEGORY_META[category].icon} key={`pill_${index}_${category}`} label={CATEGORY_META[category].label} onPress={() => setCategoryFilter(category)} />
          ))}
          <BudgetCategoryPill active={false} icon="add-outline" label="New" onPress={() => setRoute({ name: 'allocation' })} />
        </ScrollView>
        <Pressable accessibilityRole="button" onPress={() => setRoute({ name: 'allocation' })} style={[styles.bottomPrimaryButton, { minHeight: 48, borderRadius: 12, marginTop: 12, marginBottom: 24, elevation: 0, shadowOpacity: 0 }]}>
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <Text style={[styles.bottomPrimaryText, { fontSize: 14 }]}>Add New Category</Text>
        </Pressable>
        <SectionHeader title="Categories" action="VIEW ALL" onPress={() => setRoute({ name: 'categories' })} />
        <View style={styles.stackList}>
          {visibleBudgets.map((item, index) => (
            <Pressable key={`budget_item_${item.budget.id}_${index}`} onPress={() => setRoute({ name: 'ledger', category: item.budget.category })}>
              <CategorySummaryCard currency={currency} usage={item} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    );
  }

  function renderInsightsScreen() {
    const totalBudget = Math.max(sumBudgetCap(budgetUsage), 1);
    const budgetRemaining = totalBudget - totals.expenses;
    const stackInsightAllocation = isCompactPhone;

    return (
      <ScrollView contentContainerStyle={[styles.pageContent, { paddingBottom: tabContentBottomPadding, paddingHorizontal: pageSideInset, paddingTop: topInset + 6 }]} showsVerticalScrollIndicator={false}>
        <MainHeader onBellPress={() => setNotice('Insights synced.')} />
        <Text style={styles.screenEyebrow}>PERFORMANCE ANALYTICS</Text>
        <Text style={[styles.screenTitle, { marginBottom: 24 }]}>Financial Insights</Text>
        <View style={[styles.segmentedControl, isSmallPhone && styles.segmentedControlCompact]}>
          {(['daily', 'weekly', 'monthly'] as const).map((item) => (
            <Pressable accessibilityRole="button" key={item} onPress={() => setInsightRange(item)} style={[styles.segmentItem, isSmallPhone && styles.segmentItemCompact, insightRange === item && styles.segmentItemActive]}>
              <Text style={[styles.segmentItemText, isSmallPhone && styles.segmentItemTextCompact, insightRange === item && styles.segmentItemTextActive]}>{capitalize(item)}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.cardLarge}>
          <View style={styles.cardTopSpread}>
            <View>
              <Text style={styles.cardTitle}>Spending Velocity</Text>
              <Text style={styles.cardCaption}>Trend relative to baseline</Text>
            </View>
            {(() => {
              const avg = dailyTotals.length > 0 ? dailyTotals.reduce((s, d) => s + d.total, 0) / dailyTotals.length : 0;
              const last = dailyTotals[dailyTotals.length - 1]?.total ?? 0;
              const isHigh = last > avg && avg > 0;
              const pct = avg > 0 ? Math.abs(((last - avg) / avg) * 100).toFixed(1) : '0.0';
              return (
                <View style={[styles.gainPill, isHigh && { backgroundColor: 'rgba(217,45,42,0.1)' }]}>
                  <Ionicons name={isHigh ? 'trending-up-outline' : 'trending-down-outline'} size={14} color={isHigh ? COLOR.red : COLOR.greenDark} />
                  <Text style={[styles.gainPillText, isHigh && { color: COLOR.red }]}>{dailyTotals.length > 1 ? `${isHigh ? '↑' : '↓'} ${pct}%` : '—'}</Text>
                </View>
              );
            })()}
          </View>
          <View style={styles.chartCenterWrap}>
            <BarChart data={dailyTotals} currency={currency} />
          </View>
          <View style={[styles.insightFooterPill, isSmallPhone && styles.insightFooterPillCompact]}>
            <View style={styles.insightFooterLeft}>
              <Ionicons name="pie-chart-outline" size={20} color={COLOR.greenDark} />
              <Text style={styles.insightFooterLabel}>Budget Remaining</Text>
            </View>
            <Text style={styles.insightFooterValue}>{formatMoney(Math.max(budgetRemaining, 0), currency)}</Text>
          </View>
        </View>
        <Text style={styles.screenEyebrow}>MONTHLY OVERVIEW</Text>
        <Text style={styles.screenTitle}>{new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date())} Budgets</Text>
        <Text style={styles.bodyCopy}>You've utilized {Math.round((totals.expenses / totalBudget) * 100)}% of your total monthly allowance. Your trajectory suggests you'll remain within limits by month-end.</Text>
        <View style={styles.card}>
          <Text style={styles.cardCaption}>Total Spent</Text>
          <Text style={styles.emphasisAmount}>{formatMoney(totals.expenses, currency)}</Text>
          <View style={styles.trackSoft}>
            <View style={[styles.fillSoft, { width: `${Math.min((totals.expenses / totalBudget) * 100, 100)}%` }]} />
          </View>
          <Text style={styles.cardCaption}>of {formatMoney(totalBudget, currency)} total budget</Text>
        </View>
        <View style={styles.card}>
          <SectionHeader title="Allocation" action="View All" onPress={() => setRoute({ name: 'tabs', tab: 'budgets' })} />
          <AllocationDonut compact={stackInsightAllocation} data={categoryTotals} currency={currency} />
        </View>
        <SectionHeader title="Smart Suggestions" action="View All" />
        <SuggestionCard badge="HIGH IMPACT" body="You have 3 overlapping streaming services. Consolidating could save you $34.99/mo." title="Optimize Subscriptions" />
        <SuggestionCard badge="STRATEGY" body={`Your '${CATEGORY_META.Savings.label}' allocation is exceeding targets. Shift ${formatMoney(200, currency)} to your index fund.`} title="Investment Rebalance" />
        <View style={styles.blueInsightCard}>
          <View style={styles.ringRow}>
            <RingStat value={75} />
          </View>
          <Text style={[styles.blueInsightTitle, isSmallPhone && styles.blueInsightTitleCompact]}>Smart Allocation Detected</Text>
          <Text style={[styles.blueInsightBody, isSmallPhone && styles.blueInsightBodyCompact]}>
            We noticed you've spent 40% less on Transport this month. Would you like to re-allocate $150 towards your
            Vacation Fund?
          </Text>
          <Pressable accessibilityRole="button" onPress={() => setRoute({ name: 'allocation' })} style={styles.whiteButton}>
            <Text style={styles.whiteButtonText}>Allocate Now</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  function renderSettingsScreen() {
    const stackSettingCards = isCompactPhone;

    return (
      <ScrollView
        contentContainerStyle={[styles.pageContent, { paddingBottom: tabContentBottomPadding, paddingHorizontal: pageSideInset, paddingTop: topInset + 6 }]}
        showsVerticalScrollIndicator={false}
      >
        <MainHeader onBellPress={() => setNotice('No new security events.')} />

        <View style={styles.profileCard}>
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarLargeText}>AS</Text>
          </View>
          <View style={styles.profileText}>
            <Text style={styles.profileName}>Alexander Sterling</Text>
            <View style={styles.memberPill}>
              <Text style={styles.memberPillText}>PRO MEMBER</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLOR.textSoft} />
        </View>

        <View style={[styles.settingCardRow, stackSettingCards && styles.settingCardRowCompact]}>
          <View style={styles.settingMiniCard}>
            <View style={styles.settingMiniIcon}>
              <Ionicons name="wallet-outline" size={24} color={COLOR.primary} />
            </View>
            <Text style={styles.settingMiniLabel}>Default Ledger</Text>
            <Text style={styles.settingMiniValue}>Main Savings</Text>
          </View>
          <View style={[styles.settingMiniCard, styles.settingMiniCardBlue]}>
            <Ionicons name="sparkles-outline" size={24} color="#FFFFFF" />
            <Text style={[styles.settingMiniLabel, styles.settingMiniLabelWhite]}>Upgrade to Sovereign Executive</Text>
          </View>
        </View>

        <Text style={styles.screenEyebrow}>SECURITY & ACCESS</Text>
        <View style={styles.cardStack}>
          <SettingRow
            detail={finance.settings.lockDashboard ? 'FaceID or TouchID Enabled' : 'Biometric lock disabled'}
            icon="finger-print-outline"
            title="Biometrics"
            trailing={
              <Switch
                onValueChange={toggleBiometric}
                thumbColor="#FFFFFF"
                trackColor={{ false: '#D8E1F2', true: COLOR.green }}
                value={finance.settings.lockDashboard}
              />
            }
          />
          <SettingRow
            detail="Last updated 5 days ago"
            icon="key-outline"
            title="User Password"
            trailing={<Ionicons name="chevron-forward" size={20} color={COLOR.textSoft} />}
            onPress={() => setRoute({ name: 'change-password' })}
          />
        </View>

        <Text style={styles.screenEyebrow}>PREFERENCES</Text>
        <View style={styles.cardStack}>
          <SettingRow
            detail={currency}
            icon="cash-outline"
            title="Currency"
            trailing={<Ionicons name="chevron-forward" size={20} color={COLOR.textSoft} />}
            onPress={cycleCurrency}
          />
          <SettingRow detail="English (US)" icon="language-outline" title="Language" />
          <SettingRow detail="Export transaction history to CSV" icon="download-outline" title="Export Data" onPress={handleExport} />
          <SettingRow detail="FAQs and direct support" icon="help-circle-outline" title="Help Center" onPress={() => Alert.alert('Help Center', 'Support is not available offline.')} />
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setUnlocked(false);
            setFabOpen(false);
          }}
          style={styles.signOutButton}
        >
          <Ionicons name="log-out-outline" size={22} color={COLOR.red} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>

        <Text style={styles.versionText}>SOVEREIGN LEDGER v2.4.0</Text>
      </ScrollView>
    );
  }

  function renderAddTransactionScreen() {
    return (
      <View style={styles.subPage}>
        <BackHeader sideInset={pageSideInset} topInset={topInset} title="Add Transaction" onBack={goBack} />
        <ScrollView
          contentContainerStyle={[styles.subPageContent, { paddingBottom: subPageContentPaddingBottom, paddingHorizontal: pageSideInset }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.segmentedControl, isSmallPhone && styles.segmentedControlCompact]}>
            {(['expense', 'income'] as TransactionType[]).map((type) => (
              <Pressable
                accessibilityRole="button"
                key={type}
                onPress={() => setTxForm({ ...txForm, type, category: type === 'income' ? 'Salary' : txForm.category })}
                style={[styles.segmentItem, isSmallPhone && styles.segmentItemCompact, txForm.type === type && styles.segmentItemActive]}
              >
                <Text
                  style={[
                    styles.segmentItemText,
                    isSmallPhone && styles.segmentItemTextCompact,
                    txForm.type === type && styles.segmentItemTextActive,
                  ]}
                >
                  {type === 'expense' ? 'Expense' : 'Income'}
                </Text>
              </Pressable>
            ))}
          </View>

          <AmountCard amount={txForm.amount} compact={isCompactPhone} currency={currency} title="AMOUNT" />

          <NumberPad keyWidth={numberPadKeyWidth} keyHeight={numberPadKeyHeight} onBackspace={backspaceTransactionAmount} onPressKey={appendTransactionAmount} />

          <Pressable accessibilityRole="button" onPress={() => setNotice('Details recorded.')} style={styles.continueButton}>
            <Text style={styles.continueButtonText}>Continue</Text>
          </Pressable>

          <View style={styles.card}>
            <FormLabel label="CONTACT NAME" />
            <InputField
              icon="person-outline"
              placeholder="John Doe"
              value={txForm.contact}
              onChangeText={(contact) => setTxForm({ ...txForm, contact })}
            />
            <FormLabel label="DATE" />
            <InputField
              icon="calendar-outline"
              placeholder="MM/DD/YYYY"
              value={txForm.date}
              onChangeText={(date) => setTxForm({ ...txForm, date })}
            />
            <FormLabel label="CATEGORY" />
            <SelectField
              icon={CATEGORY_META[txForm.category].icon}
              value={CATEGORY_META[txForm.category].label}
              onPress={() => rotateTransactionCategory(txForm.category)}
            />
            <NotesField
              label="NOTES"
              placeholder="What was this for?"
              value={txForm.note}
              onChangeText={(note) => setTxForm({ ...txForm, note })}
            />
            <View style={styles.rowBetween}>
              <Text style={styles.inlineLabel}>Recurring transaction</Text>
              <Switch
                onValueChange={(addRecurring) => setTxForm({ ...txForm, addRecurring })}
                thumbColor="#FFFFFF"
                trackColor={{ false: '#D8E1F2', true: COLOR.primary }}
                value={txForm.addRecurring}
              />
            </View>
          </View>
        </ScrollView>

        <View style={[styles.bottomButtonWrap, { paddingBottom: 16 + bottomInset, paddingHorizontal: pageSideInset }]}>
          <Pressable accessibilityRole="button" onPress={saveTransaction} style={styles.bottomPrimaryButton}>
            <Ionicons name="checkmark-circle-outline" size={22} color="#FFFFFF" />
            <Text style={styles.bottomPrimaryText}>Save Transaction</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  function renderAllocationScreen() {
    return (
      <View style={styles.subPage}>
        <BackHeader sideInset={pageSideInset} topInset={topInset} title="New Category" onBack={goBack} />
        <ScrollView
          contentContainerStyle={[styles.subPageContent, { paddingBottom: subPageContentPaddingBottom, paddingHorizontal: pageSideInset }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <FormLabel label="CATEGORY NAME" />
            <SelectField
              icon={CATEGORY_META[allocationForm.category].icon}
              value={CATEGORY_META[allocationForm.category].ledgerTitle}
              onPress={() => {
                const cats: Category[] = ['Food', 'Transport', 'Salary', 'Shopping', 'Rent', 'Bills', 'Health', 'Savings', 'Other'];
                const idx = cats.indexOf(allocationForm.category);
                setAllocationForm({ ...allocationForm, category: cats[(idx + 1) % cats.length] });
              }}
            />
            <NotesField
              label="NOTES"
              placeholder="What was this for?"
              value={allocationForm.notes}
              onChangeText={(notes) => setAllocationForm({ ...allocationForm, notes })}
            />
          </View>

          <AmountCard amount={allocationForm.amount} compact={isCompactPhone} currency={currency} title="CATEGORY BUDGET" />

          <NumberPad compact keyWidth={numberPadKeyWidth} keyHeight={numberPadKeyHeight} onBackspace={backspaceAllocationAmount} onPressKey={appendAllocationAmount} />

          <View style={styles.card}>
            <Text style={styles.sectionTitleBlue}>Timeframe</Text>
            <View style={[styles.segmentedControl, isSmallPhone && styles.segmentedControlCompact]}>
              {(['weekly', 'monthly'] as const).map((period) => (
                <Pressable
                  accessibilityRole="button"
                  key={period}
                  onPress={() => setAllocationForm({ ...allocationForm, period })}
                  style={[
                    styles.segmentItem,
                    isSmallPhone && styles.segmentItemCompact,
                    allocationForm.period === period && styles.segmentItemActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentItemText,
                      isSmallPhone && styles.segmentItemTextCompact,
                      allocationForm.period === period && styles.segmentItemTextActive,
                    ]}
                  >
                    {capitalize(period)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.infoRowCard}>
              <Ionicons name="repeat-outline" size={22} color={COLOR.primary} />
              <Text style={styles.infoRowTitle}>Recurring Transaction</Text>
              <Switch
                onValueChange={(recurring) => setAllocationForm({ ...allocationForm, recurring })}
                thumbColor="#FFFFFF"
                trackColor={{ false: '#D8E1F2', true: COLOR.primary }}
                value={allocationForm.recurring}
              />
            </View>

            <View style={styles.infoRowCard}>
              <Ionicons name="notifications-outline" size={22} color={COLOR.greenDark} />
              <View style={styles.infoCopy}>
                <Text style={styles.infoRowTitle}>Notify at 80%</Text>
                <Text style={styles.infoRowSubtitle}>SPENDING LIMIT</Text>
              </View>
              <Switch
                onValueChange={(thresholdAlert) => setAllocationForm({ ...allocationForm, thresholdAlert })}
                thumbColor="#FFFFFF"
                trackColor={{ false: '#D8E1F2', true: COLOR.primary }}
                value={allocationForm.thresholdAlert}
              />
            </View>
          </View>
        </ScrollView>

        <View style={[styles.bottomButtonWrap, { paddingBottom: 16 + bottomInset, paddingHorizontal: pageSideInset }]}>
          <Pressable accessibilityRole="button" onPress={saveAllocation} style={styles.bottomPrimaryButton}>
            <Text style={styles.bottomPrimaryText}>Save Up!</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  function renderLedgerScreen(transactions: Transaction[]) {
    const ledgerCategory = route.name === 'ledger' ? route.category : 'all';
    const title = ledgerCategory !== 'all' ? `${CATEGORY_META[ledgerCategory].ledgerTitle} Ledgers` : 'Recent Ledgers';

    return (
      <View style={styles.subPage}>
        <BackHeader sideInset={pageSideInset} topInset={topInset} title={title} onBack={goBack} />
        <ScrollView
          contentContainerStyle={[styles.subPageContent, { paddingBottom: subPageFooterPadding + 18, paddingHorizontal: pageSideInset }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.stackList}>
            {transactions.map((item) => (
              <LedgerRow
                amount={item.amount}
                category={item.category}
                currency={currency}
                date={item.date}
                key={item.id}
                note={item.note}
                time={formatTime(item.createdAt)}
                type={item.type}
              />
            ))}
          </View>

          <Pressable accessibilityRole="button" onPress={() => setRoute({ name: 'add-transaction' })} style={styles.dashedActionCard}>
            <View style={styles.actionIconWrap}>
              <Ionicons name="reader-outline" size={28} color={COLOR.primary} />
            </View>
            <Text style={styles.actionTitle}>New Ledger</Text>
            <Text style={styles.actionSubtitle}>Record a new Receipt/Ledger</Text>
          </Pressable>
        </ScrollView>

        <View style={[styles.bottomButtonWrap, { paddingBottom: 16 + bottomInset, paddingHorizontal: pageSideInset }]}>
          <Pressable accessibilityRole="button" onPress={() => setRoute({ name: 'add-transaction' })} style={styles.bottomPrimaryButton}>
            <Text style={styles.bottomPrimaryText}>Quick Add</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  function renderCategoriesScreen() {
    return (
      <View style={styles.subPage}>
        <BackHeader sideInset={pageSideInset} topInset={topInset} title="Categories" onBack={goBack} />
        <ScrollView
          contentContainerStyle={[styles.subPageContent, { paddingBottom: 32 + bottomInset, paddingHorizontal: pageSideInset }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.stackList}>
            {budgetUsage.map((item, index) => (
              <CategorySummaryCard key={`cat_summary_${item.budget.id}_${index}`} currency={currency} usage={item} />
            ))}
          </View>

          <Pressable accessibilityRole="button" onPress={() => setRoute({ name: 'allocation' })} style={styles.dashedActionCard}>
            <View style={styles.actionIconWrap}>
              <Ionicons name="reader-outline" size={28} color={COLOR.primary} />
            </View>
            <Text style={styles.actionTitle}>Create New Category</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  function renderPasswordScreen() {
    return (
      <View style={styles.subPage}>
        <BackHeader sideInset={pageSideInset} topInset={topInset} title="Change Password" onBack={goBack} />
        <ScrollView
          contentContainerStyle={[styles.subPageContent, { paddingBottom: 32 + bottomInset, paddingHorizontal: pageSideInset }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.centerHero}>
            <View style={styles.actionIconWrap}>
              <Ionicons name="timer-outline" size={30} color={COLOR.primaryDark} />
            </View>
            <Text style={styles.passwordTitle}>Change Password</Text>
            <Text style={styles.passwordBody}>
              Update your credentials to maintain strict account security and data protection.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.inputLabel}>Current Password</Text>
            <PasswordField value="" />
            <Text style={styles.inputLabel}>New Password</Text>
            <PasswordField value="Pr3cisi0n!2024" />
            <View style={styles.passwordStrengthRow}>
              <View style={styles.strengthFill} />
              <View style={styles.strengthFill} />
              <View style={styles.strengthFill} />
              <View style={styles.strengthEmpty} />
            </View>
            <Text style={styles.cardCaption}>Strength: Strong</Text>

            <View style={styles.requirementBox}>
              <Text style={styles.requirementTitle}>SECURITY REQUIREMENTS</Text>
              <RequirementRow label="At least 12 characters long" />
              <RequirementRow label="Contains uppercase & lowercase letters" />
              <RequirementRow label="Contains numbers or symbols" />
            </View>

            <Text style={styles.inputLabel}>Confirm New Password</Text>
            <PasswordField value="Pr3cisi0n!2024" />

            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setNotice('Password updated.');
                goBack();
              }}
              style={styles.bottomPrimaryButton}
            >
              <Text style={styles.bottomPrimaryText}>Update Password</Text>
            </Pressable>

            <Pressable accessibilityRole="button" onPress={goBack} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>
          </View>

          <Text style={styles.encryptedFootnote}>Your connection is securely encrypted.</Text>
        </ScrollView>
      </View>
    );
  }

  function renderAllocationListScreen() {
    return (
      <View style={styles.subPage}>
        <BackHeader sideInset={pageSideInset} topInset={topInset} title="Allocation" onBack={goBack} />
        <ScrollView
          contentContainerStyle={[styles.subPageContent, { paddingBottom: subPageFooterPadding + 18, paddingHorizontal: pageSideInset }]}
          showsVerticalScrollIndicator={false}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.allocationFilterRow, { paddingRight: pageSideInset }]}
          >
            <FilterPill label="All" active={categoryFilter === 'all'} onPress={() => setCategoryFilter('all')} />
            {EXPENSE_CATEGORIES.map((cat, index) => (
              <FilterPill
                key={`cat_filter_${index}_${cat}`}
                label={CATEGORY_META[cat].label}
                active={categoryFilter === cat}
                onPress={() => setCategoryFilter(cat)}
              />
            ))}
          </ScrollView>

          <View style={styles.stackList}>
            {visibleBudgets.map((item, index) => (
              <BudgetCard
                key={`budget_card_list_${item.budget.id}_${index}`}
                currency={currency}
                onPress={() => setRoute({ name: 'ledger', category: item.budget.category })}
                usage={item}
              />
            ))}
          </View>

          <Pressable accessibilityRole="button" onPress={() => setRoute({ name: 'allocation' })} style={styles.dashedActionCard}>
            <View style={styles.actionIconWrap}>
              <Ionicons name="reader-outline" size={28} color={COLOR.primary} />
            </View>
            <Text style={styles.actionTitle}>New Allocation</Text>
            <Text style={styles.actionSubtitle}>Record a new Allocation</Text>
          </Pressable>
        </ScrollView>

        <View style={[styles.bottomButtonWrap, { paddingBottom: 16 + bottomInset, paddingHorizontal: pageSideInset }]}>
          <Pressable accessibilityRole="button" onPress={() => setRoute({ name: 'allocation' })} style={styles.bottomPrimaryButton}>
            <Text style={styles.bottomPrimaryText}>Quick Add</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  function renderFab() {
    const fabBottom = bottomNavHeight + 16;

    return (
      <>
        {fabOpen ? (
          <View pointerEvents="box-none" style={[styles.fabMenuWrap, { bottom: fabBottom - 4, right: pageSideInset }]}>
            <View style={styles.fabMenu}>
              <SmallAction icon="create-outline" onPress={openExpenseEntry} />
              <SmallAction icon="wallet-outline" onPress={() => {
                setFabOpen(false);
                setRoute({ name: 'allocation' });
              }} />
              <SmallAction icon="reader-outline" onPress={() => {
                setFabOpen(false);
                setRoute({ name: 'ledger', category: 'all' });
              }} />
              <Pressable accessibilityRole="button" onPress={() => setFabOpen(false)} style={styles.fabClose}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
        ) : null}

        <Pressable accessibilityRole="button" onPress={() => setFabOpen(true)} style={[styles.fabButton, { bottom: fabBottom, right: pageSideInset }]}>
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </Pressable>
      </>
    );
  }

  function rotateTransactionCategory(current: Category) {
    const options: Category[] = ['Food', 'Transport', 'Salary', 'Shopping', 'Rent', 'Other'];
    const index = options.indexOf(current);
    const next = options[(index + 1) % options.length];
    setTxForm({ ...txForm, category: next });
  }
}

function MainHeader({ onBellPress }: { onBellPress: () => void }) {
  return (
    <View style={styles.overviewHeader}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#11479E', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="person" size={16} color="#FFFFFF" />
        </View>
        <Text style={{ fontSize: 16, fontWeight: '800', color: '#0A2F6E' }}>Sovereign Ledger</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={onBellPress} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="notifications-outline" size={20} color="#0F172A" />
      </Pressable>
    </View>
  );
}

function BackHeader({ title, onBack, sideInset, topInset = 0 }: { title: string; onBack: () => void; sideInset: number; topInset?: number }) {
  return (
    <View style={[styles.headerBack, { paddingHorizontal: sideInset, paddingTop: topInset + 14 }]}>
      <Pressable accessibilityRole="button" onPress={onBack} style={styles.headerIconButton}>
        <Ionicons name="arrow-back" size={22} color={COLOR.primaryDark} />
      </Pressable>
      <Text numberOfLines={1} style={styles.backTitle}>
        {title}
      </Text>
    </View>
  );
}

function BottomNav({
  activeTab,
  onChange,
  navPaddingTop,
  navPaddingBottom,
  compact,
}: {
  activeTab: MainTab;
  onChange: (tab: MainTab) => void;
  navPaddingTop: number;
  navPaddingBottom: number;
  compact?: boolean;
}) {
  return (
    <View style={[styles.bottomNav, compact && styles.bottomNavCompact, { paddingTop: navPaddingTop, paddingBottom: navPaddingBottom }]}>
      {TAB_ITEMS.map((item) => {
        const active = activeTab === item.key;
        return (
          <Pressable
            accessibilityRole="button"
            key={item.key}
            onPress={() => onChange(item.key)}
            style={[styles.bottomNavItem, compact && styles.bottomNavItemCompact, active && styles.bottomNavItemActive]}
          >
            <Ionicons name={item.icon} size={22} color={active ? COLOR.primary : '#9AA7BE'} />
            <Text style={[styles.bottomNavText, compact && styles.bottomNavTextCompact, active && styles.bottomNavTextActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SectionHeader({
  title,
  action,
  onPress,
}: {
  title: string;
  action?: string;
  onPress?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? (
        <Pressable accessibilityRole="button" onPress={onPress}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function StatusChip({ label, tone }: { label: string; tone: 'success' | 'danger' | 'warning' | 'neutral' }) {
  return (
    <View style={[styles.statusChip, tone === 'success' ? styles.statusChipGreen : tone === 'warning' ? styles.statusChipYellow : tone === 'neutral' ? styles.statusChipNeutral : styles.statusChipRed]}>
      <Text style={[styles.statusChipText, tone === 'danger' && styles.statusChipTextRed, tone === 'warning' && styles.statusChipTextYellow, tone === 'neutral' && styles.statusChipNeutralText]}>{label}</Text>
    </View>
  );
}

function CategoryBadge({
  category,
  iconOverride,
}: {
  category: Category;
  iconOverride?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={[styles.categoryBadge, { backgroundColor: CATEGORY_META[category].accent }]}>
      <Ionicons name={iconOverride ?? CATEGORY_META[category].icon} size={20} color={COLOR.primaryDark} />
    </View>
  );
}

function LedgerRow({
  amount,
  category,
  currency,
  date,
  metaLabel,
  note,
  time,
  type,
  onPress,
}: {
  amount: number;
  category: Category;
  currency: CurrencyCode;
  date: string;
  metaLabel?: string;
  note: string;
  time: string;
  type: TransactionType;
  onPress?: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" disabled={!onPress} onPress={onPress} style={styles.ledgerRow}>
      <CategoryBadge category={category} />
      <View style={styles.ledgerBody}>
        <Text numberOfLines={1} style={styles.ledgerTitle}>
          {note}
        </Text>
        <Text numberOfLines={1} style={styles.ledgerMeta}>
          {(metaLabel ?? CATEGORY_META[category].ledgerTitle).toUpperCase()} | {time}
        </Text>
      </View>
      <View style={styles.ledgerRight}>
        <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.ledgerAmount, type === 'income' ? styles.positiveText : styles.negativeText]}>
          {type === 'income' ? '+' : '-'}
          {formatSimpleMoney(amount, currency)}
        </Text>
        <Text style={styles.ledgerDate}>{monthLabel(date)}</Text>
      </View>
    </Pressable>
  );
}

function FilterPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.filterPill, active && styles.filterPillActive]}>
      <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>{label}</Text>
    </Pressable>
  );
}

function BudgetCategoryPill({
  label,
  active,
  onPress,
  icon,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.budgetCategoryPill, active && styles.budgetCategoryPillActive]}>
      <Ionicons name={icon} size={20} color={active ? COLOR.primary : '#59647B'} />
      <Text style={[styles.budgetCategoryPillText, active && styles.budgetCategoryPillTextActive]}>{label}</Text>
    </Pressable>
  );
}

function BudgetCard({ usage, currency, onPress }: { usage: BudgetUsage; currency: CurrencyCode; onPress: () => void }) {
  const percent = (usage.spent / Math.max(usage.budget.amount, 1)) * 100;
  const tone = usage.overBudget ? 'danger' : percent > 80 ? 'warning' : percent > 50 ? 'neutral' : 'success';
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.budgetCard}>
      <View style={styles.budgetCardHeader}>
        <View style={styles.budgetCardHeaderLeft}>
          <CategoryBadge category={usage.budget.category} />
          <View>
            <Text style={styles.budgetCardTitle}>{CATEGORY_META[usage.budget.category].ledgerTitle}</Text>
            <Text style={styles.budgetCardSubtext}>
              {formatSimpleMoney(usage.spent, currency)} <Text style={styles.budgetCardMuted}>/ {formatSimpleMoney(usage.budget.amount, currency)}</Text>
            </Text>
          </View>
        </View>
        <StatusChip label={tone === 'danger' ? 'AT LIMIT' : tone === 'warning' ? 'WATCH' : tone === 'neutral' ? 'ON TRACK' : 'HEALTHY'} tone={tone} />
      </View>

      <View style={styles.rowBetween}>
        <Text style={styles.captionStrong}>USED {Math.round(percent)}%</Text>
        <Text style={[styles.captionStrong, usage.remaining < 0 ? styles.negativeText : styles.positiveText]}>
          {usage.remaining < 0 ? `-${formatSimpleMoney(Math.abs(usage.remaining), currency)} LEFT` : `+${formatSimpleMoney(usage.remaining, currency)} LEFT`}
        </Text>
      </View>

      <View style={styles.trackBudget}>
        <View
          style={[
            styles.fillBudget,
            {
              width: `${Math.min(percent, 100)}%`,
              backgroundColor: usage.overBudget ? COLOR.red : tone === 'warning' ? '#F59E0B' : CATEGORY_META[usage.budget.category].progress,
            },
          ]}
        />
      </View>
    </Pressable>
  );
}

function CategorySummaryCard({ usage, currency }: { usage: BudgetUsage; currency: CurrencyCode }) {
  return (
    <View style={styles.categorySummaryCard}>
      <CategoryBadge category={usage.budget.category} />
      <Text style={styles.categorySummaryTitle}>{CATEGORY_META[usage.budget.category].ledgerTitle}</Text>
      <View style={styles.trackBudget}>
        <View
          style={[
            styles.fillBudget,
            {
              width: `${Math.min((usage.spent / Math.max(usage.budget.amount, 1)) * 100, 100)}%`,
              backgroundColor: usage.overBudget ? COLOR.red : CATEGORY_META[usage.budget.category].progress,
            },
          ]}
        />
      </View>
      <View style={styles.rowBetween}>
        <Text style={styles.categorySummaryAmount}>{formatSimpleMoney(usage.spent, currency)}</Text>
        <Text style={[styles.captionStrong, usage.remaining < 0 ? styles.negativeText : styles.captionStrong]}>
          {formatSimpleMoney(Math.abs(usage.remaining), currency)} LEFT
        </Text>
      </View>
    </View>
  );
}

function WeeklyBars({ data }: { data: Array<{ date: string; total: number }> }) {
  const max = Math.max(...data.map((item) => item.total), 1);

  return (
    <View style={styles.weeklyBars}>
      {data.map((item) => {
        const fill = Math.max((item.total / max) * 100, item.total > 0 ? 20 : 12);
        return (
          <View key={item.date} style={styles.barColumn}>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { height: `${fill}%` }]} />
            </View>
            <Text style={styles.barLabel}>{weekdayLabel(item.date)}</Text>
          </View>
        );
      })}
    </View>
  );
}

function TrendChart() {
  return (
    <Svg height={170} viewBox="0 0 320 170" width="100%">
      <Defs>
        <LinearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0%" stopColor="#4B77C8" stopOpacity="0.25" />
          <Stop offset="100%" stopColor="#4B77C8" stopOpacity="0.02" />
        </LinearGradient>
      </Defs>
      <Path
        d="M18 136 C 52 92, 92 72, 138 94 C 170 110, 214 128, 262 76 C 286 50, 304 64, 318 104"
        fill="none"
        stroke={COLOR.primary}
        strokeLinecap="round"
        strokeWidth={5}
      />
      <Path
        d="M18 136 C 52 92, 92 72, 138 94 C 170 110, 214 128, 262 76 C 286 50, 304 64, 318 104 L318 170 L18 170 Z"
        fill="url(#trendFill)"
      />
      <Circle cx="216" cy="78" fill={COLOR.primary} r="4" />
      <Circle cx="78" cy="74" fill={COLOR.primary} r="4" />
      {['W1', 'W2', 'W3', 'W4'].map((label, index) => (
        <SvgText fill="#9AA7BE" fontSize="12" fontWeight="700" key={label} x={25 + index * 80} y="162">
          {label}
        </SvgText>
      ))}
    </Svg>
  );
}

function AllocationDonut({
  data,
  currency,
  compact,
}: {
  data: Array<{ category: Category; total: number; color: string }>;
  currency: CurrencyCode;
  compact?: boolean;
}) {
  const total = data.reduce((sum, item) => sum + item.total, 0);
  const size = 120;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const palette = ['#11479E', '#3F74C4', '#48D7A1', '#7C879B'];

  return (
    <View style={[styles.donutRow, compact && styles.donutRowCompact]}>
      <Svg height={size} viewBox={`0 0 ${size} ${size}`} width={size}>
        <Circle cx={size / 2} cy={size / 2} fill="transparent" r={radius} stroke="#E6EBF3" strokeWidth={16} />
        {data.slice(0, 4).map((item, index) => {
          const segment = total === 0 ? 0 : (item.total / total) * circumference;
          const dashOffset = -offset;
          offset += segment;
          return (
            <Circle
              cx={size / 2}
              cy={size / 2}
              fill="transparent"
              key={`arc_${item.category}_${index}`}
              origin={`${size / 2}, ${size / 2}`}
              r={radius}
              rotation="-90"
              stroke={palette[index]}
              strokeDasharray={`${segment} ${circumference - segment}`}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              strokeWidth={16}
            />
          );
        })}
        <SvgText fill="#9AA7BE" fontSize="10" fontWeight="700" textAnchor="middle" x="60" y="56">
          TOTAL
        </SvgText>
        <SvgText fill={COLOR.primaryDark} fontSize="24" fontWeight="800" textAnchor="middle" x="60" y="83">
          {compactNumber(total, currency)}
        </SvgText>
      </Svg>

      <View style={styles.donutLegend}>
        {data.slice(0, 4).map((item, index) => (
          <View key={`legend_${item.category}_${index}`} style={styles.donutLegendRow}>
            <View style={[styles.legendBullet, { backgroundColor: palette[index] }]} />
            <Text style={styles.donutLegendLabel}>{CATEGORY_META[item.category].ledgerTitle}</Text>
            <Text style={styles.donutLegendPct}>{Math.round((item.total / Math.max(total, 1)) * 100)}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function SuggestionCard({ title, body, badge }: { title: string; body: string; badge: string }) {
  return (
    <View style={styles.suggestionCard}>
      <View style={styles.suggestionTop}>
        <View style={styles.suggestionIcon}>
          <Ionicons name="sparkles-outline" size={20} color={COLOR.greenDark} />
        </View>
        <View style={styles.strategyPill}>
          <Text style={styles.strategyPillText}>{badge}</Text>
        </View>
      </View>
      <Text style={styles.suggestionTitle}>{title}</Text>
      <Text style={styles.suggestionBody}>{body}</Text>
      <Text style={styles.suggestionLink}>Take Action</Text>
    </View>
  );
}

function RingStat({ value }: { value: number }) {
  const size = 140;
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const progress = (value / 100) * circumference;

  return (
    <Svg height={size} viewBox={`0 0 ${size} ${size}`} width={size}>
      <Circle cx={size / 2} cy={size / 2} fill="transparent" r={radius} stroke="#1F5EC5" strokeWidth={10} />
      <Circle
        cx={size / 2}
        cy={size / 2}
        fill="transparent"
        origin={`${size / 2}, ${size / 2}`}
        r={radius}
        rotation="-90"
        stroke={COLOR.green}
        strokeDasharray={`${progress} ${circumference - progress}`}
        strokeLinecap="round"
        strokeWidth={10}
      />
      <SvgText fill="#FFFFFF" fontSize="26" fontWeight="800" textAnchor="middle" x="70" y="76">
        {value}%
      </SvgText>
      <SvgText fill="#A6BCF2" fontSize="12" fontWeight="700" textAnchor="middle" x="70" y="96">
        GOAL
      </SvgText>
    </Svg>
  );
}

function FormLabel({ label }: { label: string }) {
  return <Text style={styles.formLabel}>{label}</Text>;
}

function InputField({
  icon,
  placeholder,
  value,
  onChangeText,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={styles.inputWrap}>
      <Ionicons name={icon} size={20} color={COLOR.textSoft} />
      <TextInput
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#B6BFCE"
        style={styles.inputField}
        value={value}
      />
    </View>
  );
}

function SelectField({ value, onPress, icon }: { value: string; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.inputWrap}>
      {icon ? <Ionicons name={icon} size={20} color={COLOR.textSoft} /> : null}
      <Text style={styles.selectText}>{value}</Text>
      <Ionicons name="chevron-down" size={20} color={COLOR.textSoft} />
    </Pressable>
  );
}

function AmountCard({
  amount,
  currency,
  title,
  compact,
}: {
  amount: string;
  currency: CurrencyCode;
  title: string;
  compact?: boolean;
}) {
  return (
    <View style={[styles.amountCard, compact && styles.amountCardCompact]}>
      <View style={styles.currencyFlag}>
        <Text style={styles.currencyFlagText}>{currency}</Text>
      </View>
      <Text style={styles.formLabel}>{title}</Text>
      <View style={styles.amountRow}>
        <Text style={[styles.amountPrefix, compact && styles.amountPrefixCompact]}>$</Text>
        <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.amountValue, compact && styles.amountValueCompact]}>
          {amount ? Number(amount).toFixed(2) : '0.00'}
        </Text>
      </View>
    </View>
  );
}

function NotesField({
  label,
  placeholder,
  value,
  onChangeText,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
}) {
  return (
    <View>
      <View style={styles.notesHeader}>
        <Ionicons name="reorder-three-outline" size={22} color={COLOR.textSoft} />
        <Text style={styles.formLabel}>{label}</Text>
      </View>
      <TextInput
        multiline
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#7D879C"
        style={styles.notesInput}
        textAlignVertical="top"
        value={value}
      />
    </View>
  );
}

function NumberPad({
  onPressKey,
  onBackspace,
  compact,
  keyWidth,
  keyHeight,
}: {
  onPressKey: (value: string) => void;
  onBackspace: () => void;
  compact?: boolean;
  keyWidth?: number;
  keyHeight?: number;
}) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'];

  return (
    <View style={[styles.numberPad, compact && styles.numberPadCompact]}>
      {keys.map((key) => (
        <Pressable
          accessibilityRole="button"
          key={key}
          onPress={() => (key === 'back' ? onBackspace() : onPressKey(key))}
          style={({ pressed }) => [
            styles.numberKey,
            keyWidth ? { width: keyWidth } : null,
            keyHeight ? { height: keyHeight } : null,
            pressed && styles.keyPressed,
          ]}
        >
          {key === 'back' ? (
            <Ionicons name="backspace-outline" size={22} color={COLOR.text} />
          ) : (
            <Text style={styles.numberKeyText}>{key}</Text>
          )}
        </Pressable>
      ))}
    </View>
  );
}

function PasswordField({ value }: { value: string }) {
  return (
    <View style={styles.inputWrap}>
      <TextInput placeholder="Enter current password" placeholderTextColor="#8894AA" style={styles.inputField} value={value} />
      <Ionicons name="eye-outline" size={20} color={COLOR.textSoft} />
    </View>
  );
}

function RequirementRow({ label }: { label: string }) {
  return (
    <View style={styles.requirementRow}>
      <Ionicons name="checkmark-circle-outline" size={18} color="#1E63D2" />
      <Text style={styles.requirementText}>{label}</Text>
    </View>
  );
}

function SettingRow({
  title,
  detail,
  icon,
  trailing,
  onPress,
}: {
  title: string;
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
  trailing?: React.ReactNode;
  onPress?: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" disabled={!onPress} onPress={onPress} style={styles.settingRow}>
      <View style={styles.settingIcon}>
        <Ionicons name={icon} size={22} color={COLOR.primary} />
      </View>
      <View style={styles.settingCopy}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingDetail}>{detail}</Text>
      </View>
      {trailing}
    </Pressable>
  );
}

function SmallAction({ icon, onPress }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.smallAction}>
      <Ionicons name={icon} size={24} color={COLOR.primaryDark} />
    </Pressable>
  );
}

function PortfolioHeroBackground() {
  return (
    <Svg height="100%" pointerEvents="none" preserveAspectRatio="none" style={StyleSheet.absoluteFillObject} width="100%">
      <Defs>
        <LinearGradient id="portfolioHeroGrad" x1="0" x2="1" y1="0" y2="1">
          <Stop offset="0%" stopColor="#0D3A8A" />
          <Stop offset="58%" stopColor="#1A58BD" />
          <Stop offset="100%" stopColor="#1E63D2" />
        </LinearGradient>
        <LinearGradient id="portfolioGlowGrad" x1="0" x2="1" y1="0" y2="1">
          <Stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
          <Stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </LinearGradient>
      </Defs>
      <Rect fill="url(#portfolioHeroGrad)" height="100%" width="100%" x="0" y="0" />
      <Circle cx="330" cy="26" fill="rgba(86,205,255,0.18)" r="78" />
      <Circle cx="40" cy="222" fill="rgba(255,255,255,0.06)" r="94" />
      <Path d="M18 206 C 82 176, 138 176, 210 214 S 318 246, 370 216" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
      <Rect fill="url(#portfolioGlowGrad)" height="72" rx="20" width="160" x="190" y="138" />
      <Path d="M34 94 C 82 66, 116 60, 160 72" fill="none" stroke="rgba(255,255,255,0.14)" strokeLinecap="round" strokeWidth="3" />
    </Svg>
  );
}

function BurnHeroBackground() {
  return (
    <Svg height="100%" pointerEvents="none" preserveAspectRatio="none" style={StyleSheet.absoluteFillObject} width="100%">
      <Defs>
        <LinearGradient id="burnHeroGrad" x1="0" x2="1" y1="0" y2="1">
          <Stop offset="0%" stopColor="#0A3479" />
          <Stop offset="52%" stopColor="#11479E" />
          <Stop offset="100%" stopColor="#173C74" />
        </LinearGradient>
        <LinearGradient id="burnTrackGlow" x1="0" x2="1" y1="0" y2="0">
          <Stop offset="0%" stopColor="rgba(255,255,255,0.1)" />
          <Stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </LinearGradient>
      </Defs>
      <Rect fill="url(#burnHeroGrad)" height="100%" width="100%" x="0" y="0" />
      <Circle cx="300" cy="56" fill="rgba(72,215,161,0.12)" r="92" />
      <Circle cx="72" cy="214" fill="rgba(255,255,255,0.05)" r="84" />
      <Rect fill="rgba(255,255,255,0.06)" height="92" rx="22" width="128" x="228" y="122" />
      <Rect fill="url(#burnTrackGlow)" height="8" rx="4" width="220" x="34" y="114" />
      <Path d="M36 178 C 102 148, 154 150, 208 178 S 310 208, 360 166" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2" />
    </Svg>
  );
}

function appendAmountValue(current: string, input: string) {
  if (input === '.' && current.includes('.')) {
    return current;
  }
  if (input === '.' && current.length === 0) {
    return '0.';
  }
  if (current === '0' && input !== '.') {
    return input;
  }
  return `${current}${input}`;
}

function buildAllocationCards(
  budgets: BudgetUsage[],
  categoryTotals: Array<{ category: Category; total: number; color: string }>,
) {
  if (budgets.length > 0) {
    return budgets.slice(0, 6).map((item) => ({
      category: item.budget.category,
      left: item.remaining,
      percent: Math.min((item.spent / Math.max(item.budget.amount, 1)) * 100, 100),
      progressColor: item.overBudget ? COLOR.red : CATEGORY_META[item.budget.category].progress,
      spent: item.spent,
    }));
  }

  return categoryTotals.slice(0, 6).map((item) => ({
    category: item.category,
    left: item.total * 0.3,
    percent: 72,
    progressColor: CATEGORY_META[item.category].progress,
    spent: item.total,
  }));
}

function filterTransactions(transactions: Transaction[], category: Category | 'all') {
  if (category === 'all') {
    return transactions;
  }
  return transactions.filter((item) => item.category === category);
}

function sumBudgetCap(items: BudgetUsage[]) {
  return items.reduce((sum, item) => sum + item.budget.amount, 0);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function weekdayLabel(dateValue: string) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(new Date(dateValue)).toUpperCase();
}

function monthLabel(dateValue: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit' }).format(new Date(dateValue)).toUpperCase();
}

function formatTime(dateValue: string) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(dateValue));
}

function compactNumber(value: number, currency: CurrencyCode) {
  const symbol = CURRENCY_OPTIONS.find((item) => item.code === currency)?.label.split(' ').slice(-1)[0] ?? '$';
  if (value >= 1000) {
    return `${symbol}${(value / 1000).toFixed(1)}k`;
  }
  return `${symbol}${value.toFixed(0)}`;
}

function formatSimpleMoney(value: number, currency: CurrencyCode) {
  return formatMoney(value, currency).replace('.00', '');
}

function formatCompactBalance(value: number, currency: CurrencyCode) {
  return formatMoney(value, currency).replace('.00', '.40');
}

function formatPortfolioMoney(value: number, currency: CurrencyCode) {
  return formatMoney(value, currency);
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: COLOR.background,
    flex: 1,
  },
  root: {
    backgroundColor: COLOR.background,
    flex: 1,
  },
  loadingScreen: {
    alignItems: 'center',
    backgroundColor: COLOR.background,
    flex: 1,
    gap: 14,
    justifyContent: 'center',
  },
  loadingText: {
    color: COLOR.textSoft,
    fontSize: 15,
    fontWeight: '700',
  },
  noticeBar: {
    alignItems: 'center',
    backgroundColor: '#EEF4FF',
    borderBottomColor: '#D7E4FF',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  noticeText: {
    color: COLOR.primaryDark,
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  pageContent: {
    paddingBottom: 128,
    paddingHorizontal: 24,
    paddingTop: 0,
  },
  overviewContent: {
    paddingBottom: 150,
  },
  overviewContentCompact: {
    paddingBottom: 170,
    paddingTop: 12,
  },
  subPage: {
    backgroundColor: COLOR.background,
    flex: 1,
  },
  subPageContent: {
    paddingBottom: 168,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  headerMain: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 22,
    marginTop: 6,
  },
  brandWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    flex: 1,
    gap: 12,
    marginRight: 12,
    minWidth: 0,
  },
  avatarSmall: {
    alignItems: 'center',
    backgroundColor: '#203A5B',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  avatarSmallText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  brandTitle: {
    color: COLOR.primaryDark,
    flexShrink: 1,
    fontSize: 18,
    fontWeight: '800',
  },
  headerIconButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    elevation: 4,
    height: 42,
    justifyContent: 'center',
    shadowColor: '#B8C6DD',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    width: 42,
  },
  headerBack: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    marginBottom: 18,
    paddingBottom: 8,
    paddingTop: 14,
  },
  backTitle: {
    color: COLOR.primaryDark,
    flexShrink: 1,
    fontSize: 18,
    fontWeight: '800',
  },
  heroCard: {
    borderRadius: 28,
    elevation: 12,
    marginBottom: 28,
    padding: 24,
    position: 'relative',
    shadowColor: '#4A6FA5',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
  },
  overviewHeroCard: {
    minHeight: 216,
  },
  overviewHeroCardCompact: {
    minHeight: 200,
    padding: 20,
  },
  portfolioHeroCard: {
    gap: 18,
    minHeight: 220,
  },
  portfolioHeroCardCompact: {
    gap: 16,
    minHeight: 200,
  },
  portfolioHeroHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  portfolioHeroEyebrowWrap: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 999,
    maxWidth: '72%',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  portfolioTrendPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(72,215,161,0.18)',
    borderColor: 'rgba(120,255,205,0.24)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  portfolioTrendText: {
    color: COLOR.green,
    fontSize: 13,
    fontWeight: '800',
  },
  portfolioHeroAmount: {
    marginTop: 0,
  },
  portfolioHeroSubtext: {
    marginTop: -6,
  },
  portfolioInsightRow: {
    flexDirection: 'row',
    gap: 12,
  },
  portfolioInsightCard: {
    backgroundColor: 'rgba(255,255,255,0.11)',
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  portfolioInsightLabel: {
    color: '#A7C0F5',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  portfolioInsightValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  portfolioActionRow: {
    marginTop: 0,
  },
  heroTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heroEyebrow: {
    color: '#A7C0F5',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.8,
  },
  heroPill: {
    backgroundColor: 'rgba(72,215,161,0.22)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  heroPillText: {
    color: COLOR.green,
    fontSize: 13,
    fontWeight: '800',
  },
  heroAmount: {
    color: '#FFFFFF',
    fontSize: 38,
    fontWeight: '900',
    marginTop: 18,
  },
  heroAmountCompact: {
    fontSize: 34,
    marginTop: 14,
  },
  heroSubtext: {
    color: '#8BA7DC',
    fontSize: 15,
    fontStyle: 'italic',
    marginTop: 6,
  },
  heroSubtextCompact: {
    fontSize: 14,
  },
  heroActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 26,
  },
  heroActionRowCompact: {
    gap: 10,
    marginTop: 20,
  },
  heroActionButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14,
    flexDirection: 'row',
    flex: 1,
    gap: 8,
    minHeight: 48,
    justifyContent: 'center',
  },
  heroActionButtonCompact: {
    minHeight: 44,
  },
  portfolioActionButton: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
  },
  heroActionText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  heroProgressTrack: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 999,
    height: 14,
    marginTop: 24,
    overflow: 'hidden',
  },
  heroProgressFill: {
    backgroundColor: '#84B0FF',
    borderRadius: 999,
    height: '100%',
  },
  budgetHeroCard: {
    gap: 18,
    minHeight: 270,
  },
  budgetHeroCardCompact: {
    gap: 16,
    minHeight: 254,
    padding: 20,
  },
  budgetHeroHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
  },
  budgetHeroIntro: {
    flex: 1,
  },
  budgetHeroThreshold: {
    color: '#A9C3F7',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 10,
  },
  budgetHeroStatusWrap: {
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
  },
  budgetHeroAmountRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'space-between',
  },
  budgetHeroAmount: {
    flex: 1,
    marginTop: 0,
  },
  budgetHeroPercentBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    borderWidth: 1,
    minWidth: 82,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  budgetHeroPercentValue: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
  },
  budgetHeroPercentLabel: {
    color: '#A9C3F7',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginTop: 2,
  },
  budgetHeroProgressWrap: {
    marginTop: -2,
    position: 'relative',
  },
  budgetHeroTrackGlow: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 999,
    height: 18,
    left: 18,
    position: 'absolute',
    right: 18,
    top: -2,
    zIndex: -1,
  },
  budgetHeroMetricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  budgetHeroMetricRowCompact: {
    flexDirection: 'column',
  },
  budgetHeroMetricCard: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    minHeight: 76,
    minWidth: 94,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  budgetHeroMetricCardWide: {
    minWidth: 128,
  },
  budgetHeroMetricLabel: {
    color: '#A9C3F7',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  budgetHeroMetricValue: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 8,
  },
  budgetHeroMetricValueSmall: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 22,
    marginTop: 8,
  },
  heroFootRow: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginTop: 18,
  },
  heroFootRowCompact: {
    alignItems: 'flex-start',
    flexDirection: 'column',
    gap: 8,
    marginTop: 16,
  },
  heroFootText: {
    color: '#E2ECFF',
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  heroFootTextCompact: {
    fontSize: 13,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  sectionTitle: {
    color: COLOR.text,
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '800',
  },
  sectionAction: {
    color: COLOR.primary,
    fontSize: 14,
    fontWeight: '800',
    marginLeft: 12,
  },
  horizontalList: {
    gap: 14,
    paddingBottom: 26,
  },
  overviewHorizontalList: {
    paddingRight: 24,
  },
  overviewHorizontalListCompact: {
    paddingBottom: 22,
  },
  allocationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    elevation: 4,
    minHeight: 168,
    padding: 16,
    shadowColor: '#C0CFDF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    width: 162,
  },
  overviewAllocationCard: {
    minHeight: 168,
  },
  overviewAllocationCardCompact: {
    minHeight: 158,
    padding: 14,
  },
  categoryBadge: {
    alignItems: 'center',
    borderRadius: 16,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  allocationTitle: {
    color: COLOR.text,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 18,
  },
  allocationValue: {
    color: COLOR.primaryDark,
    fontSize: 17,
    fontWeight: '900',
    marginTop: 6,
  },
  track: {
    backgroundColor: '#DDE3EC',
    borderRadius: 999,
    height: 6,
    marginTop: 16,
    overflow: 'hidden',
  },
  fill: {
    borderRadius: 999,
    height: '100%',
  },
  allocationLeft: {
    color: '#5A6070',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 12,
  },
  card: {
    backgroundColor: COLOR.card,
    borderRadius: 22,
    elevation: 5,
    marginBottom: 20,
    padding: 18,
    shadowColor: '#B4C5DC',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.13,
    shadowRadius: 16,
  },
  overviewTrendCard: {
    paddingBottom: 16,
    paddingTop: 20,
  },
  overviewTrendCardCompact: {
    paddingBottom: 12,
    paddingTop: 18,
  },
  cardLarge: {
    backgroundColor: COLOR.card,
    borderRadius: 22,
    elevation: 5,
    marginBottom: 20,
    padding: 18,
    shadowColor: '#B4C5DC',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.13,
    shadowRadius: 16,
  },
  chartTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardTitle: {
    color: COLOR.text,
    fontSize: 18,
    fontWeight: '800',
  },
  cardCaption: {
    color: '#97A4B9',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  chartDots: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  chartDot: {
    backgroundColor: '#D8DFEA',
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  chartDotActive: {
    backgroundColor: COLOR.primary,
  },
  stackList: {
    gap: 14,
    marginBottom: 14,
  },
  overviewLedgerList: {
    gap: 16,
  },
  overviewLedgerListCompact: {
    gap: 14,
  },
  ledgerRow: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    elevation: 3,
    flexDirection: 'row',
    gap: 14,
    padding: 15,
    shadowColor: '#C0CFDF',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.09,
    shadowRadius: 8,
  },
  ledgerBody: {
    flex: 1,
    minWidth: 0,
  },
  ledgerTitle: {
    color: COLOR.text,
    fontSize: 16,
    fontWeight: '800',
  },
  ledgerMeta: {
    color: '#8B9AB0',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 6,
    textTransform: 'uppercase',
  },
  ledgerRight: {
    alignItems: 'flex-end',
    flexShrink: 0,
    marginLeft: 8,
    minWidth: 72,
  },
  ledgerAmount: {
    fontSize: 16,
    fontWeight: '900',
  },
  ledgerDate: {
    color: '#9AA7BE',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  positiveText: {
    color: COLOR.greenDark,
  },
  negativeText: {
    color: COLOR.red,
  },
  bottomNav: {
    backgroundColor: '#FFFFFF',
    borderTopColor: '#ECF0F8',
    borderTopWidth: StyleSheet.hairlineWidth,
    bottom: 0,
    elevation: 12,
    flexDirection: 'row',
    left: 0,
    paddingHorizontal: 8,
    position: 'absolute',
    right: 0,
    shadowColor: '#6A8AB8',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  bottomNavCompact: {
    paddingHorizontal: 4,
  },
  bottomNavItem: {
    alignItems: 'center',
    borderRadius: 12,
    flex: 1,
    gap: 4,
    justifyContent: 'center',
    minHeight: 44,
  },
  bottomNavItemCompact: {
    gap: 3,
    minHeight: 40,
  },
  bottomNavItemActive: {
    backgroundColor: '#E8F0FF',
  },
  bottomNavText: {
    color: '#9AA7BE',
    fontSize: 10,
    fontWeight: '800',
  },
  bottomNavTextCompact: {
    fontSize: 9,
  },
  bottomNavTextActive: {
    color: COLOR.primary,
  },
  fabButton: {
    alignItems: 'center',
    backgroundColor: COLOR.primary,
    borderRadius: 18,
    bottom: 116,
    height: 56,
    justifyContent: 'center',
    position: 'absolute',
    right: 24,
    shadowColor: '#85A7E2',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.28,
    shadowRadius: 22,
    width: 56,
  },
  fabMenuWrap: {
    bottom: 112,
    position: 'absolute',
    right: 24,
  },
  fabMenu: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  smallAction: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  fabClose: {
    alignItems: 'center',
    backgroundColor: COLOR.primary,
    borderRadius: 16,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  screenEyebrow: {
    color: '#7B859B',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  screenTitle: {
    color: COLOR.primaryDark,
    fontSize: 23,
    fontWeight: '900',
    marginBottom: 14,
  },
  segmentedControl: {
    backgroundColor: '#F8FAFD',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
    padding: 4,
  },
  segmentedControlCompact: {
    gap: 6,
    padding: 3,
  },
  segmentItem: {
    alignItems: 'center',
    borderRadius: 12,
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
  },
  segmentItemCompact: {
    minHeight: 38,
  },
  segmentItemActive: {
    backgroundColor: '#E4ECFF',
  },
  segmentItemText: {
    color: '#5C6880',
    fontSize: 14,
    fontWeight: '700',
  },
  segmentItemTextCompact: {
    fontSize: 12,
  },
  segmentItemTextActive: {
    color: COLOR.primary,
  },
  cardTopSpread: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  gainPill: {
    alignItems: 'center',
    backgroundColor: '#E7F7F0',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  gainPillText: {
    color: COLOR.greenDark,
    fontSize: 13,
    fontWeight: '800',
  },
  weeklyBars: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  barColumn: {
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  barTrack: {
    backgroundColor: '#DEE5EF',
    borderRadius: 12,
    height: 138,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    width: '100%',
  },
  barFill: {
    backgroundColor: '#7C9FD5',
    borderRadius: 12,
    width: '100%',
  },
  barLabel: {
    color: '#8D99AF',
    fontSize: 11,
    fontWeight: '800',
  },
  insightFooterPill: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginTop: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  insightFooterPillCompact: {
    alignItems: 'flex-start',
    flexDirection: 'column',
  },
  insightFooterLeft: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minWidth: 0,
  },
  insightFooterLabel: {
    color: COLOR.text,
    fontSize: 16,
    fontWeight: '700',
  },
  insightFooterValue: {
    color: COLOR.greenDark,
    fontSize: 16,
    fontWeight: '900',
  },
  bodyCopy: {
    color: '#5E687C',
    fontSize: 16,
    lineHeight: 26,
    marginBottom: 20,
  },
  emphasisAmount: {
    color: COLOR.primary,
    fontSize: 24,
    fontWeight: '900',
    marginTop: 8,
  },
  trackSoft: {
    backgroundColor: '#DDE3ED',
    borderRadius: 999,
    height: 6,
    marginVertical: 12,
    overflow: 'hidden',
  },
  fillSoft: {
    backgroundColor: COLOR.primary,
    borderRadius: 999,
    height: '100%',
  },
  donutRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
  },
  donutRowCompact: {
    alignItems: 'flex-start',
    flexDirection: 'column',
  },
  donutLegend: {
    flex: 1,
    gap: 10,
  },
  donutLegendRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  legendBullet: {
    borderRadius: 6,
    height: 12,
    width: 12,
  },
  donutLegendLabel: {
    color: COLOR.text,
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  donutLegendPct: {
    color: COLOR.text,
    fontSize: 13,
    fontWeight: '800',
  },
  suggestionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    elevation: 4,
    marginBottom: 16,
    padding: 18,
    shadowColor: '#B4C5DC',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  suggestionTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  suggestionIcon: {
    alignItems: 'center',
    backgroundColor: '#EAF7F2',
    borderRadius: 14,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  strategyPill: {
    backgroundColor: '#E2F1EA',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  strategyPillText: {
    color: COLOR.greenDark,
    fontSize: 11,
    fontWeight: '800',
  },
  suggestionTitle: {
    color: COLOR.text,
    fontSize: 19,
    fontWeight: '800',
  },
  suggestionBody: {
    color: '#5C687C',
    fontSize: 15,
    lineHeight: 24,
    marginTop: 10,
  },
  suggestionLink: {
    color: COLOR.primary,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 16,
  },
  blueInsightCard: {
    backgroundColor: COLOR.primary,
    borderRadius: 30,
    marginBottom: 16,
    padding: 24,
  },
  ringRow: {
    marginBottom: 18,
  },
  blueInsightTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 34,
    maxWidth: 220,
  },
  blueInsightTitleCompact: {
    fontSize: 22,
    lineHeight: 30,
    maxWidth: '100%',
  },
  blueInsightBody: {
    color: '#BFD0F5',
    fontSize: 18,
    lineHeight: 30,
    marginTop: 18,
  },
  blueInsightBodyCompact: {
    fontSize: 16,
    lineHeight: 26,
    marginTop: 14,
  },
  whiteButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    justifyContent: 'center',
    marginTop: 22,
    minHeight: 50,
  },
  whiteButtonText: {
    color: COLOR.primary,
    fontSize: 17,
    fontWeight: '800',
  },
  profileCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    elevation: 4,
    flexDirection: 'row',
    gap: 16,
    marginBottom: 22,
    padding: 16,
    shadowColor: '#B4C5DC',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  avatarLarge: {
    alignItems: 'center',
    backgroundColor: '#253E5E',
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  avatarLargeText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  profileText: {
    flex: 1,
    minWidth: 0,
  },
  profileName: {
    color: COLOR.text,
    fontSize: 18,
    fontWeight: '800',
  },
  memberPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#E8F0FF',
    borderRadius: 999,
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  memberPillText: {
    color: COLOR.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  settingCardRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 28,
  },
  settingCardRowCompact: {
    flexDirection: 'column',
  },
  settingMiniCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    elevation: 4,
    flex: 1,
    minHeight: 120,
    padding: 16,
    shadowColor: '#B4C5DC',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.11,
    shadowRadius: 12,
  },
  settingMiniCardBlue: {
    backgroundColor: COLOR.primary,
  },
  settingMiniIcon: {
    alignItems: 'center',
    backgroundColor: '#EEF4FF',
    borderRadius: 14,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  settingMiniLabel: {
    color: '#5B677C',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 16,
  },
  settingMiniValue: {
    color: COLOR.text,
    fontSize: 22,
    fontWeight: '800',
    marginTop: 4,
  },
  settingMiniLabelWhite: {
    color: '#FFFFFF',
    marginTop: 18,
  },
  cardStack: {
    gap: 14,
    marginBottom: 24,
  },
  settingRow: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    elevation: 3,
    flexDirection: 'row',
    gap: 14,
    padding: 16,
    shadowColor: '#C0CFDF',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  settingIcon: {
    alignItems: 'center',
    backgroundColor: '#F4F7FC',
    borderRadius: 14,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  settingCopy: {
    flex: 1,
  },
  settingTitle: {
    color: COLOR.text,
    fontSize: 17,
    fontWeight: '800',
  },
  settingDetail: {
    color: COLOR.textSoft,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  signOutButton: {
    alignItems: 'center',
    backgroundColor: '#FFF0EE',
    borderColor: '#FFD0CC',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    marginTop: 12,
    minHeight: 58,
  },
  signOutText: {
    color: COLOR.red,
    fontSize: 17,
    fontWeight: '800',
  },
  versionText: {
    color: '#8E96AA',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 3,
    marginBottom: 18,
    marginTop: 30,
    textAlign: 'center',
  },
  formLabel: {
    color: '#7A8294',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.7,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  inputWrap: {
    alignItems: 'center',
    backgroundColor: '#F3F6FB',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
    minHeight: 50,
    minWidth: 0,
    paddingHorizontal: 14,
  },
  inputField: {
    color: COLOR.text,
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    minWidth: 0,
  },
  selectText: {
    color: '#6E778A',
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    minWidth: 0,
  },
  amountCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    elevation: 6,
    marginBottom: 18,
    minHeight: 160,
    padding: 22,
    position: 'relative',
    shadowColor: '#B4C5DC',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.13,
    shadowRadius: 16,
  },
  amountCardCompact: {
    minHeight: 164,
    padding: 20,
  },
  currencyFlag: {
    alignItems: 'center',
    backgroundColor: COLOR.primaryDark,
    borderBottomLeftRadius: 16,
    borderTopRightRadius: 22,
    height: 40,
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
    top: 0,
    width: 66,
  },
  currencyFlagText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  amountRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: 4,
    marginTop: 16,
    minWidth: 0,
  },
  amountPrefix: {
    color: '#B8BFCE',
    fontSize: 36,
    fontWeight: '700',
  },
  amountPrefixCompact: {
    fontSize: 30,
  },
  amountValue: {
    color: COLOR.primaryDark,
    flexShrink: 1,
    fontSize: 58,
    fontWeight: '900',
  },
  amountValueCompact: {
    fontSize: 48,
  },
  numberPad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 18,
  },
  numberPadCompact: {
    marginBottom: 22,
  },
  numberKey: {
    alignItems: 'center',
    backgroundColor: '#F1F4F9',
    borderRadius: 18,
    elevation: 1,
    height: 80,
    justifyContent: 'center',
    shadowColor: '#C0CFDF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    width: '30.9%',
  },
  numberKeyText: {
    color: COLOR.text,
    fontSize: 20,
    fontWeight: '700',
  },
  keyPressed: {
    opacity: 0.82,
  },
  notesHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  notesInput: {
    color: COLOR.text,
    fontSize: 16,
    minHeight: 112,
    width: '100%',
  },
  inlineLabel: {
    color: COLOR.text,
    fontSize: 16,
    fontWeight: '700',
  },
  bottomButtonWrap: {
    backgroundColor: COLOR.background,
    borderTopColor: '#E8EEF7',
    borderTopWidth: StyleSheet.hairlineWidth,
    bottom: 0,
    left: 0,
    paddingTop: 14,
    position: 'absolute',
    right: 0,
  },
  bottomPrimaryButton: {
    alignItems: 'center',
    backgroundColor: COLOR.primaryDark,
    borderRadius: 18,
    elevation: 6,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    minHeight: 62,
    shadowColor: '#0A2F6E',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
  },
  bottomPrimaryText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  continueButton: {
    alignItems: 'center',
    backgroundColor: '#D6E4FF',
    borderRadius: 16,
    justifyContent: 'center',
    marginBottom: 18,
    minHeight: 58,
  },
  continueButtonText: {
    color: COLOR.primary,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  captureCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#A7C4FF',
    borderRadius: 28,
    borderStyle: 'dashed',
    borderWidth: 1,
    minHeight: 520,
    justifyContent: 'center',
    padding: 24,
  },
  captureCardCompact: {
    minHeight: 400,
  },
  captureIcon: {
    alignItems: 'center',
    backgroundColor: '#DDE7FF',
    borderRadius: 18,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  captureTitle: {
    color: COLOR.text,
    fontSize: 24,
    fontWeight: '800',
    marginTop: 26,
    textAlign: 'center',
  },
  captureTitleCompact: {
    fontSize: 22,
    marginTop: 22,
  },
  captureBody: {
    color: COLOR.text,
    fontSize: 18,
    lineHeight: 30,
    marginTop: 24,
    textAlign: 'center',
  },
  captureBodyCompact: {
    fontSize: 16,
    lineHeight: 26,
    marginTop: 18,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  categoryScroller: {
    gap: 12,
    paddingBottom: 6,
  },
  budgetCategoryPill: {
    alignItems: 'center',
    backgroundColor: '#F3F6FB',
    borderRadius: 18,
    gap: 10,
    height: 92,
    justifyContent: 'center',
    width: 88,
  },
  budgetCategoryPillActive: {
    backgroundColor: '#DDE7FF',
  },
  budgetCategoryPillText: {
    color: '#4B5567',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  budgetCategoryPillTextActive: {
    color: COLOR.primary,
  },
  categoryTile: {
    alignItems: 'center',
    backgroundColor: '#F3F6FB',
    borderRadius: 20,
    gap: 10,
    height: 82,
    justifyContent: 'center',
  },
  categoryTileActive: {
    backgroundColor: '#DDE7FF',
  },
  categoryTileText: {
    color: '#4B5567',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  categoryTileTextActive: {
    color: COLOR.primary,
  },
  sectionTitleBlue: {
    color: COLOR.primaryDark,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 16,
  },
  infoRowCard: {
    alignItems: 'center',
    backgroundColor: '#F9FBFF',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    minHeight: 58,
    paddingHorizontal: 14,
  },
  infoLabel: {
    color: '#8B94A6',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  infoInput: {
    color: COLOR.text,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
    minWidth: 0,
  },
  infoRowTitle: {
    color: COLOR.text,
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
  },
  infoRowSubtitle: {
    color: '#8B94A6',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
  },
  infoCopy: {
    flex: 1,
  },
  actionCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    elevation: 4,
    marginBottom: 20,
    padding: 24,
    shadowColor: '#B4C5DC',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
  },
  dashedActionCard: {
    alignItems: 'center',
    backgroundColor: '#FAFCFF',
    borderColor: '#A7C4FF',
    borderRadius: 22,
    borderStyle: 'dashed',
    borderWidth: 1.5,
    justifyContent: 'center',
    marginBottom: 20,
    minHeight: 160,
    padding: 24,
  },
  actionIconWrap: {
    alignItems: 'center',
    backgroundColor: '#DDE7FF',
    borderRadius: 18,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  actionTitle: {
    color: COLOR.text,
    fontSize: 20,
    fontWeight: '800',
    marginTop: 24,
    textAlign: 'center',
  },
  actionSubtitle: {
    color: '#7A859A',
    fontSize: 16,
    marginTop: 8,
    textAlign: 'center',
  },
  primaryButtonWide: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: COLOR.primary,
    borderRadius: 14,
    justifyContent: 'center',
    marginTop: 24,
    minHeight: 54,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  filterRow: {
    gap: 10,
    marginBottom: 20,
  },
  filterPill: {
    alignItems: 'center',
    backgroundColor: '#F8FAFD',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 14,
  },
  filterPillActive: {
    backgroundColor: '#E4ECFF',
  },
  filterPillText: {
    color: '#5C6880',
    fontSize: 14,
    fontWeight: '700',
  },
  filterPillTextActive: {
    color: COLOR.primary,
  },
  budgetCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    elevation: 5,
    padding: 18,
    shadowColor: '#B4C5DC',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
  },
  statusChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  statusChipGreen: {
    backgroundColor: '#1A8C57',
  },
  statusChipRed: {
    backgroundColor: '#FFE8E6',
    borderColor: '#FFBBB7',
    borderWidth: 1,
  },
  statusChipText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  statusChipTextRed: {
    color: '#C1180B',
  },
  statusChipNeutral: {
    backgroundColor: '#ECEEF4',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  statusChipNeutralText: {
    color: '#5D6677',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  budgetCardTitle: {
    color: COLOR.text,
    fontSize: 16,
    fontWeight: '800',
  },
  budgetCardAmount: {
    color: COLOR.text,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 10,
  },
  budgetCardMuted: {
    color: '#5A6070',
    fontSize: 16,
    fontWeight: '600',
  },
  rowBetween: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  captionStrong: {
    color: '#5A6070',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 14,
  },
  trackBudget: {
    backgroundColor: '#DDE3EC',
    borderRadius: 999,
    height: 10,
    marginTop: 10,
    overflow: 'hidden',
  },
  fillBudget: {
    borderRadius: 999,
    height: '100%',
  },
  categorySummaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    elevation: 4,
    minHeight: 140,
    padding: 16,
    shadowColor: '#C0CFDF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  categorySummaryTitle: {
    color: COLOR.text,
    fontSize: 18,
    fontWeight: '800',
    marginTop: 18,
  },
  categorySummaryAmount: {
    color: COLOR.primary,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 12,
  },
  centerHero: {
    alignItems: 'center',
    marginBottom: 18,
    marginTop: 8,
  },
  passwordTitle: {
    color: COLOR.primaryDark,
    fontSize: 26,
    fontWeight: '900',
    marginTop: 18,
  },
  passwordBody: {
    color: '#5C687C',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 10,
    maxWidth: 300,
    textAlign: 'center',
  },
  inputLabel: {
    color: COLOR.text,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 8,
  },
  passwordStrengthRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 8,
    marginTop: -4,
  },
  strengthFill: {
    backgroundColor: '#1F63D2',
    borderRadius: 999,
    flex: 1,
    height: 6,
  },
  strengthEmpty: {
    backgroundColor: '#D7DFEE',
    borderRadius: 999,
    flex: 1,
    height: 6,
  },
  requirementBox: {
    backgroundColor: '#EDF3FF',
    borderRadius: 16,
    marginVertical: 16,
    padding: 14,
  },
  requirementTitle: {
    color: '#485569',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginBottom: 10,
  },
  requirementRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  requirementText: {
    color: '#485569',
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#EEF3FF',
    borderRadius: 14,
    justifyContent: 'center',
    marginTop: 12,
    minHeight: 56,
  },
  secondaryButtonText: {
    color: COLOR.primary,
    fontSize: 17,
    fontWeight: '800',
  },
  encryptedFootnote: {
    color: '#556176',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 10,
    textAlign: 'center',
  },
  categoryScrollerWrap: {
    marginBottom: 14,
    marginLeft: -2,
  },
  budgetAddBtnDashed: {
    alignItems: 'center',
    borderColor: '#D8E2F0',
    borderRadius: 16,
    borderStyle: 'dashed',
    borderWidth: 2,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 20,
    minHeight: 56,
  },
  budgetAddBtnDashedText: {
    color: COLOR.primary,
    fontSize: 16,
    fontWeight: '800',
  },
  statusChipYellow: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1,
  },
  statusChipTextYellow: {
    color: '#D97706',
  },
  budgetCardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  budgetCardHeaderLeft: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  budgetCardSubtext: {
    color: COLOR.text,
    fontSize: 15,
    fontWeight: '900',
    marginTop: 4,
  },
  overviewHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    marginTop: 4,
  },
  headerTextWrap: {
    flex: 1,
  },
  greetingText: {
    color: '#7D879C',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  userNameText: {
    color: COLOR.primaryDark,
    fontSize: 22,
    fontWeight: '900',
  },
  heroEyebrowGlass: {
    color: '#E2ECFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  insightIconWrapGreen: {
    alignItems: 'center',
    backgroundColor: 'rgba(72,215,161,0.2)',
    borderRadius: 12,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  insightIconWrapRed: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,215,211,0.2)',
    borderRadius: 12,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  quickActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  quickActionBtn: {
    alignItems: 'center',
    gap: 8,
  },
  quickActionIcon: {
    alignItems: 'center',
    borderRadius: 20,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  quickActionText: {
    color: COLOR.text,
    fontSize: 12,
    fontWeight: '700',
  },
  chartCenterWrap: {
    alignItems: 'center',
    marginTop: 14,
  },
  allocationFilterRow: {
    gap: 10,
    marginBottom: 20,
    paddingBottom: 4,
  },
  filterPillLg: {
    alignItems: 'center',
    backgroundColor: '#F8FAFD',
    borderRadius: 14,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 16,
  },
  filterPillLgActive: {
    backgroundColor: COLOR.primarySoft,
  },
  filterPillLgText: {
    color: '#5C6880',
    fontSize: 14,
    fontWeight: '700',
  },
  filterPillLgTextActive: {
    color: COLOR.primary,
  },
});
