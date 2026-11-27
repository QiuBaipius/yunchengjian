// 应用入口：路由 + 演示机外框
import { Route, Routes } from 'react-router-dom'
import PhoneFrame from './components/PhoneFrame.jsx'
import ToastHost from './components/ToastHost.jsx'
import Home from './pages/Home.jsx'
import FullMap from './pages/FullMap.jsx'
import Match from './pages/Match.jsx'
import Pay from './pages/Pay.jsx'
import Wait from './pages/Wait.jsx'
import Ride from './pages/Ride.jsx'
import Rate from './pages/Rate.jsx'
import Plan from './pages/Plan.jsx'
import Mine from './pages/Mine.jsx'
import Guide from './pages/Guide.jsx'
import Orders from './pages/Orders.jsx'
import OrderDetail from './pages/OrderDetail.jsx'
import Invoice from './pages/Invoice.jsx'
import Messages from './pages/Messages.jsx'
import Service from './pages/Service.jsx'

export default function App() {
  return (
    <PhoneFrame>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/map" element={<FullMap />} />
        <Route path="/match" element={<Match />} />
        <Route path="/pay" element={<Pay />} />
        <Route path="/wait" element={<Wait />} />
        <Route path="/ride" element={<Ride />} />
        <Route path="/rate" element={<Rate />} />
        <Route path="/plan" element={<Plan />} />
        <Route path="/mine" element={<Mine />} />
        <Route path="/guide" element={<Guide />} />
        <Route path="/mine/orders" element={<Orders />} />
        <Route path="/mine/orders/:id" element={<OrderDetail />} />
        <Route path="/mine/orders/:id/invoice" element={<Invoice />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/service" element={<Service />} />
        <Route path="*" element={<Home />} />
      </Routes>
      <ToastHost />
    </PhoneFrame>
  )
}
