<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Collector Dashboard Summary</title>
    <style>
        @page { size: A4 portrait; margin: 14mm 12mm 14mm 12mm; }
        body { font-family: 'DejaVu Sans', sans-serif; font-size: 10px; color: #1e293b; line-height: 1.35; }
        h1 { font-size: 16px; margin-bottom: 2px; }
        .subtitle { font-size: 9.5px; color: #64748b; margin-bottom: 14px; }
        h2 { font-size: 12px; margin: 16px 0 6px; border-bottom: 1.5px solid #0f2744; padding-bottom: 3px; color: #0f2744; text-transform: uppercase; letter-spacing: 0.03em; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
        th, td { text-align: left; padding: 4.5px 6px; border-bottom: 1px solid #e2e8f0; font-size: 9px; }
        th { background: #f8fafc; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.03em; color: #475569; font-weight: bold; }
        .overview-grid { margin-bottom: 12px; }
        .overview-grid td { width: 25%; vertical-align: top; background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px; border-radius: 4px; }
        .metric-label { font-size: 8px; color: #64748b; text-transform: uppercase; font-weight: 600; letter-spacing: 0.02em; }
        .metric-value { font-size: 13px; font-weight: bold; color: #0f2744; margin: 3px 0 1px; }
        .metric-note { font-size: 7.5px; color: #64748b; }
        .amount { text-align: right; }
        .text-center { text-align: center; }
        .empty { color: #94a3b8; font-style: italic; text-align: center; padding: 12px; }

        /* Letterhead */
        .letterhead { width: 100%; border-bottom: 2px solid #0f2744; padding-bottom: 8px; margin-bottom: 8px; }
        .letterhead td { border: none; padding: 0; vertical-align: top; background: transparent; }
        .letterhead-brand { width: 56%; }
        .letterhead-meta-cell { width: 44%; text-align: right; }
        .letterhead-logo { max-height: 14mm; max-width: 36mm; }
        .letterhead-name { font-size: 12px; font-weight: bold; text-transform: uppercase; color: #0f2744; }
        .letterhead-contact { font-size: 7.5px; color: #64748b; }
        .doc-title { font-size: 13px; font-weight: bold; color: #0f2744; text-transform: uppercase; }
        .doc-meta-row { font-size: 8px; color: #334155; margin-top: 1px; }
        .doc-meta-label { color: #64748b; font-weight: 600; }
        .doc-meta-val { color: #111827; }
        .confidential { font-size: 7px; color: #b45309; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 2px; }

        /* Collector Profile Banner */
        .collector-banner { width: 100%; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 4px; margin-bottom: 12px; }
        .collector-banner td { border: none; padding: 6px 10px; font-size: 8.5px; background: transparent; }
        .collector-label { color: #64748b; font-size: 7.5px; text-transform: uppercase; font-weight: 600; }
        .collector-val { color: #0f2744; font-weight: bold; font-size: 10px; }

        /* Status Badges */
        .badge { display: inline-block; padding: 1.5px 5px; border-radius: 3px; font-size: 7.5px; font-weight: 600; }
        .badge-confirmed { background: #dcfce7; color: #166534; }
        .badge-pending { background: #fef3c7; color: #92400e; }
        .badge-overdue { background: #fee2e2; color: #991b1b; }
        .badge-partial { background: #fef3c7; color: #b45309; }

        /* Signatures block */
        .signature-table { width: 100%; margin-top: 22px; border: none; }
        .signature-table td { width: 48%; border: none; vertical-align: top; padding: 0; background: transparent; }
        .signature-line { margin-top: 36px; border-top: 1px solid #475569; width: 85%; }
        .signature-title { font-size: 8px; font-weight: bold; color: #1e293b; text-transform: uppercase; margin-top: 3px; }
        .signature-subtitle { font-size: 7.5px; color: #64748b; }

        thead { display: table-header-group; }
        tr, .overview-grid td { page-break-inside: avoid; }
    </style>
    @include('pdf.report-style')
</head>
<body>
    @include('pdf.report-footer')
    {{-- Letterhead --}}
    <table class="letterhead">
        <tr>
            <td class="letterhead-brand">
                @if($company['logo_data_uri'])
                    <img class="letterhead-logo" src="{{ $company['logo_data_uri'] }}" alt="{{ $company['name'] }} logo" />
                @endif
                <div class="letterhead-name">{{ $company['name'] }}</div>
                <div class="letterhead-contact">
                    @if($company['address'])<div>{{ $company['address'] }}</div>@endif
                    @if($company['phone'])<div>Tel: {{ $company['phone'] }}</div>@endif
                    @if($company['email'])<div>Email: {{ $company['email'] }}</div>@endif
                    @if($company['tin'])<div>TIN: {{ $company['tin'] }}</div>@endif
                </div>
            </td>
            <td class="letterhead-meta-cell">
                <div class="doc-title">Collector Dashboard Summary</div>
                <div class="doc-meta-row"><span class="doc-meta-label">Selected Period:</span> <span class="doc-meta-val">Calendar Year {{ $selected_year }}</span></div>
                <div class="doc-meta-row"><span class="doc-meta-label">Run Date:</span> <span class="doc-meta-val">{{ $generated_at->format('M j, Y, g:i A') }}</span></div>
                <div class="doc-meta-row"><span class="doc-meta-label">Currency:</span> <span class="doc-meta-val">{{ $currency }}</span></div>
                <div class="confidential">Confidential &middot; Internal Collection Performance Report</div>
            </td>
        </tr>
    </table>

    <div class="subtitle">{{ config('app.timezone') }} &middot; figures cover 1 January &ndash; {{ $period_end }}</div>

    {{-- Collector Profile Banner --}}
    <table class="collector-banner">
        <tr>
            <td style="width: 30%;">
                <div class="collector-label">Collector Name</div>
                <div class="collector-val">{{ $collector['name'] }}</div>
            </td>
            <td style="width: 22%;">
                <div class="collector-label">Employee / Collector ID</div>
                <div class="collector-val">{{ $collector['employee_no'] }}</div>
            </td>
            <td style="width: 26%;">
                <div class="collector-label">Assigned Route / Area</div>
                <div class="collector-val">{{ $collector['assigned_area'] }}</div>
            </td>
            <td style="width: 22%;">
                <div class="collector-label">Contact Number</div>
                <div class="collector-val">{{ $collector['phone'] }}</div>
            </td>
        </tr>
    </table>

    {{-- Performance & Financial Metrics --}}
    <h2>Performance Overview ({{ $selected_year }})</h2>
    <table class="overview-grid">
        <tr>
            <td>
                <div class="metric-label">Confirmed Collections ({{ $selected_year }})</div>
                <div class="metric-value">{{ $currency }} {{ number_format($stats['total_collected'], 2) }}</div>
                <div class="metric-note">{{ $stats['confirmed_count'] }} confirmed payment{{ $stats['confirmed_count'] == 1 ? '' : 's' }}</div>
            </td>
            <td>
                <div class="metric-label">Awaiting Confirmation</div>
                <div class="metric-value">{{ $currency }} {{ number_format($stats['total_pending'], 2) }}</div>
                <div class="metric-note">{{ $stats['pending_count'] }} recorded collection{{ $stats['pending_count'] == 1 ? '' : 's' }}</div>
            </td>
            <td>
                <div class="metric-label">Active Outstanding Balance</div>
                <div class="metric-value">{{ $currency }} {{ number_format($stats['outstanding_balance'], 2) }}</div>
                <div class="metric-note">Across {{ $stats['total_assigned_count'] }} assigned invoice{{ $stats['total_assigned_count'] == 1 ? '' : 's' }}</div>
            </td>
            <td>
                <div class="metric-label">Overdue Invoices</div>
                <div class="metric-value">{{ $currency }} {{ number_format($stats['overdue_amount'], 2) }}</div>
                <div class="metric-note" style="color: #dc2626;">{{ $stats['overdue_count'] }} invoice{{ $stats['overdue_count'] == 1 ? '' : 's' }} past due</div>
            </td>
        </tr>
    </table>

    {{-- Invoices to Collect (Assigned Accounts Needing Attention) --}}
    <h2>Assigned Invoices to Collect (Top Priority)</h2>
    @if(count($invoices_to_collect) === 0)
        <div class="empty">No outstanding assigned invoices — all assigned accounts are settled.</div>
    @else
        <table>
            <thead>
                <tr>
                    <th style="width: 18%;">Invoice No.</th>
                    <th style="width: 28%;">Customer</th>
                    <th style="width: 14%;">Due Date</th>
                    <th style="width: 13%;" class="amount">Invoice Amt</th>
                    <th style="width: 15%;" class="amount">Balance</th>
                    <th style="width: 12%;" class="text-center">Status</th>
                </tr>
            </thead>
            <tbody>
                @foreach($invoices_to_collect as $ar)
                    @php
                        $isOverdue = $ar->status === 'Overdue' || ($ar->status !== 'Paid' && $ar->status !== 'Cancelled' && $ar->due_date && \Carbon\Carbon::parse($ar->due_date)->isPast());
                    @endphp
                    <tr>
                        <td><strong>{{ $ar->invoice_number }}</strong></td>
                        <td>{{ $ar->customer?->customer_name ?? '—' }}</td>
                        <td style="{{ $isOverdue ? 'color: #dc2626; font-weight: bold;' : '' }}">
                            {{ $ar->due_date ? \Carbon\Carbon::parse($ar->due_date)->format('M j, Y') : '—' }}
                        </td>
                        <td class="amount">{{ number_format($ar->original_amount, 2) }}</td>
                        <td class="amount" style="font-weight: bold; {{ $isOverdue ? 'color: #dc2626;' : '' }}">
                            {{ number_format($ar->remaining_balance ?? $ar->balance, 2) }}
                        </td>
                        <td class="text-center">
                            @if($isOverdue)
                                <span class="badge badge-overdue">Overdue</span>
                            @elseif($ar->status === 'Partially Paid')
                                <span class="badge badge-partial">Partially Paid</span>
                            @else
                                <span class="badge badge-pending">{{ $ar->status }}</span>
                            @endif
                        </td>
                    </tr>
                @endforeach
            </tbody>
        </table>
    @endif

    {{-- Collections recorded in selected year --}}
    <h2>Collection Records ({{ $selected_year }})</h2>
    @if(count($recent_collections) === 0)
        <div class="empty">No collections recorded for {{ $selected_year }}.</div>
    @else
        <table>
            <thead>
                <tr>
                    <th style="width: 18%;">Receipt No.</th>
                    <th style="width: 13%;">Date</th>
                    <th style="width: 18%;">Invoice No.</th>
                    <th style="width: 25%;">Customer</th>
                    <th style="width: 12%;">Method</th>
                    <th style="width: 14%;" class="amount">Amount</th>
                </tr>
            </thead>
            <tbody>
                @foreach($recent_collections as $col)
                    <tr>
                        <td><strong>{{ $col->receipt_number }}</strong></td>
                        <td>{{ $col->collection_date ? \Carbon\Carbon::parse($col->collection_date)->format('M j, Y') : '—' }}</td>
                        <td>{{ $col->accountsReceivable?->invoice_number ?? '—' }}</td>
                        <td>{{ $col->accountsReceivable?->customer?->customer_name ?? '—' }}</td>
                        <td>{{ $col->payment_method ?? 'Cash' }}</td>
                        <td class="amount" style="font-weight: bold;">{{ number_format($col->amount_received, 2) }}</td>
                    </tr>
                @endforeach
            </tbody>
        </table>
    @endif

    {{-- Signatures --}}
    <table class="signature-table">
        <tr>
            <td>
                <div class="signature-line"></div>
                <div class="signature-title">{{ $collector['name'] }}</div>
                <div class="signature-subtitle">Collector &middot; Employee ID: {{ $collector['employee_no'] }}</div>
            </td>
            <td>
                <div class="signature-line"></div>
                <div class="signature-title">Finance / Treasury Supervisor</div>
                <div class="signature-subtitle">Reviewed &amp; Acknowledged &middot; Date: _________________</div>
            </td>
        </tr>
    </table>
</body>
</html>
