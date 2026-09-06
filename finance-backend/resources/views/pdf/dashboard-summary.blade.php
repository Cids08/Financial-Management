<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Dashboard Summary</title>
    <style>
        /* dompdf has limited CSS support — keep this simple: no flexbox/grid. */
        body { font-family: 'Helvetica', sans-serif; font-size: 11px; color: #1e293b; }
        h1 { font-size: 18px; margin-bottom: 2px; }
        .subtitle { font-size: 10px; color: #64748b; margin-bottom: 20px; }
        h2 { font-size: 13px; margin: 22px 0 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
        th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #e2e8f0; }
        th { background: #f8fafc; font-size: 10px; text-transform: uppercase; letter-spacing: 0.03em; color: #64748b; }
        .overview-grid td { width: 25%; }
        .metric-label { font-size: 9px; color: #64748b; text-transform: uppercase; }
        .metric-value { font-size: 15px; font-weight: bold; }
        .trend-up { color: #059669; }
        .trend-down { color: #dc2626; }
        .amount { text-align: right; }
        .empty { color: #94a3b8; font-style: italic; }
    </style>
</head>
<body>
    <h1>Financial Dashboard Summary</h1>
    <p class="subtitle">Generated {{ $generated_at->format('F j, Y \a\t g:i A') }}</p>

    <h2>Financial Overview</h2>
    <table class="overview-grid">
        <tr>
            <td>
                <div class="metric-label">Total Revenue</div>
                <div class="metric-value">&#8369;{{ number_format($overview['total_revenue']['value'] ?? 0, 2) }}</div>
            </td>
            <td>
                <div class="metric-label">Total Expenses</div>
                <div class="metric-value">&#8369;{{ number_format($overview['total_expenses']['value'] ?? 0, 2) }}</div>
            </td>
            <td>
                <div class="metric-label">Available Cash</div>
                <div class="metric-value">&#8369;{{ number_format($overview['available_cash']['value'] ?? 0, 2) }}</div>
            </td>
            <td>
                <div class="metric-label">Net Cash Flow</div>
                <div class="metric-value">&#8369;{{ number_format($overview['net_cash_flow']['value'] ?? 0, 2) }}</div>
            </td>
        </tr>
    </table>

    <h2>Module Snapshot</h2>
    <table>
        <tr>
            <th>Total Customers</th>
            <th>Total Suppliers</th>
            <th>Active Collectors</th>
            <th>Active Budgets</th>
        </tr>
        <tr>
            <td>{{ $module_cards['total_customers'] ?? 0 }}</td>
            <td>{{ $module_cards['total_suppliers'] ?? 0 }}</td>
            <td>{{ $module_cards['active_collectors'] ?? 0 }}</td>
            <td>{{ $module_cards['active_budgets'] ?? 0 }}</td>
        </tr>
    </table>
    <table>
        <tr>
            <th>Receivable</th>
            <th>Payable</th>
            <th>Collections Today</th>
            <th>Disbursements Today</th>
            <th>Tax Obligations</th>
        </tr>
        <tr>
            <td>&#8369;{{ number_format($module_cards['receivable'] ?? 0, 2) }}</td>
            <td>&#8369;{{ number_format($module_cards['payable'] ?? 0, 2) }}</td>
            <td>&#8369;{{ number_format($module_cards['collections_today'] ?? 0, 2) }}</td>
            <td>&#8369;{{ number_format($module_cards['disbursements_today'] ?? 0, 2) }}</td>
            <td>&#8369;{{ number_format($module_cards['tax_obligations'] ?? 0, 2) }}</td>
        </tr>
    </table>

    <h2>Recent Transactions</h2>
    @if (count($recent_transactions) === 0)
        <p class="empty">No recent transactions.</p>
    @else
        <table>
            <tr>
                <th>Date</th>
                <th>Reference No.</th>
                <th>Transaction</th>
                <th>Customer / Supplier</th>
                <th class="amount">Amount</th>
                <th>Status</th>
            </tr>
            @foreach ($recent_transactions as $t)
                <tr>
                    <td>{{ $t['date'] }}</td>
                    <td>{{ $t['reference'] }}</td>
                    <td>{{ $t['transaction'] }}</td>
                    <td>{{ $t['party'] }}</td>
                    <td class="amount">&#8369;{{ number_format($t['amount'], 2) }}</td>
                    <td>{{ $t['status'] }}</td>
                </tr>
            @endforeach
        </table>
    @endif
</body>
</html>

