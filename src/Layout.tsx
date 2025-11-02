import { currentTab } from "./state/routing";
import Tabs from "./Tabs";
import Home from "./tabs/Home";
import Profile from "./tabs/Profile";
import Scan from "./tabs/Scan";
import Search from "./tabs/Search";
import Settings from "./tabs/Settings";

export default function Layout() {
  return (
    <div class='w-screen h-dvh flex flex-col'>
      <div class='flex flex-1'>
        {
          currentTab.value === 0 ? <Home /> :
          currentTab.value === 1 ? <Search /> :
          currentTab.value === 2 ? <Scan /> :
          currentTab.value === 3 ? <Profile /> :
          currentTab.value === 4 && <Settings />
        }
      </div>

      <Tabs />
    </div>
  )
}