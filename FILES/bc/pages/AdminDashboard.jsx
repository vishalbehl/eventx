// src/renderer/pages/Dashboard.jsx
import React from 'react';
import { IoWallet, IoGlobe, IoDocumentText } from 'react-icons/io5';
import { FaShoppingCart } from 'react-icons/fa';
import LineChart from 'react-apexcharts';
import { lineChartDataDashboard, lineChartOptionsDashboard } from '../data/chartData'; // We will create this file next

// A reusable card component
function Card({ children, className }) {
  return (
    <div className={`bg-gray-900/50 backdrop-blur-xl p-6 rounded-2xl border border-white/10 ${className || ''}`}>
      {children}
    </div>
  );
}

// A reusable KPI card for the top row
function KpiCard({ title, count, percentage, icon }) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-400 capitalize">{title}</p>
          <p className="text-2xl font-bold text-white">{count}
            <span className={`ml-2 text-sm font-bold ${percentage.color === 'success' ? 'text-green-400' : 'text-red-400'}`}>
              {percentage.text}
            </span>
          </p>
        </div>
        <div className="w-12 h-12 flex items-center justify-center bg-indigo-600 rounded-xl shadow-lg">
          {icon}
        </div>
      </div>
    </Card>
  );
}

// Welcome card component
function WelcomeCard() {
    return (
        <div className="h-full p-8 rounded-2xl flex flex-col justify-between" style={{ backgroundImage: `url(./assets/images/cardimgfree.png)`, backgroundSize: 'cover' }}>
            <div>
                <p className="text-gray-300">Welcome back,</p>
                <p className="text-white text-2xl font-bold">Event Manager</p>
            </div>
            <a href="#" className="text-white font-semibold flex items-center">
                Tap to record →
            </a>
        </div>
    )
}

export default function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Top Row: KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KpiCard
          title="Today's Money"
          count="$53,000"
          percentage={{ color: "success", text: "+55%" }}
          icon={<IoWallet size="22px" color="white" />}
        />
        <KpiCard
          title="Today's Users"
          count="2,300"
          percentage={{ color: "success", text: "+3%" }}
          icon={<IoGlobe size="22px" color="white" />}
        />
        <KpiCard
          title="New Clients"
          count="+3,462"
          percentage={{ color: "error", text: "-2%" }}
          icon={<IoDocumentText size="22px" color="white" />}
        />
        <KpiCard
          title="Total Sales"
          count="$103,430"
          percentage={{ color: "success", text: "+5%" }}
          icon={<FaShoppingCart size="20px" color="white" />}
        />
      </div>

      {/* Second Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 h-80">
            <WelcomeCard />
        </div>
        <div className="lg:col-span-2">
            <Card>
                <h3 className="text-lg font-bold text-white">Sales Overview</h3>
                <p className="text-sm text-green-400">+5% more in 2025</p>
                <div className="h-64">
                    <LineChart
                        options={lineChartOptionsDashboard}
                        series={lineChartDataDashboard}
                        type="area"
                        width="100%"
                        height="100%"
                    />
                </div>
            </Card>
        </div>
      </div>
    </div>
  );
}