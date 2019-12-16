package nz.org.cacophony.sidekick.fragments

import android.content.Context
import android.net.nsd.NsdManager
import android.os.Bundle
import android.util.Log
import android.view.*
import android.widget.LinearLayout
import androidx.fragment.app.Fragment
import androidx.lifecycle.ViewModelProviders
import androidx.recyclerview.widget.DividerItemDecoration
import nz.org.cacophony.sidekick.*
import java.lang.Exception
import kotlin.concurrent.thread

class DevicesFragment : Fragment() {
    private val title = "Devices"

    private lateinit var permissionHelper: PermissionHelper
    private lateinit var messenger: Messenger
    private lateinit var deviceList: DeviceList
    private lateinit var deviceListAdapter: DeviceListAdapter
    private lateinit var recyclerView: androidx.recyclerview.widget.RecyclerView
    private lateinit var discovery: DiscoveryManager
    private lateinit var recDao: RecordingDao
    private lateinit var mainViewModel: MainViewModel

    override fun onCreateView(
            inflater: LayoutInflater,
            container: ViewGroup?,
            savedInstanceState: Bundle?
    ): View? {
        container?.removeAllViews()
        val root = inflater.inflate(R.layout.fragment_device, container, false)
        val recyclerLayoutManager = androidx.recyclerview.widget.LinearLayoutManager(requireContext())
        recyclerView = root.findViewById<androidx.recyclerview.widget.RecyclerView>(R.id.device_list2).apply {
            setHasFixedSize(true)
            layoutManager = recyclerLayoutManager
            adapter = deviceListAdapter
        }
        recyclerView.addItemDecoration(DividerItemDecoration(context, DividerItemDecoration.VERTICAL))
        setHasOptionsMenu(true)
        return root
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        val act = activity!!
        messenger = Messenger(act)
        thread(start = true) {
            val db = RecordingRoomDatabase.getDatabase(requireContext())
            recDao = db.recordingDao()
        }
        permissionHelper = PermissionHelper(requireContext())
        permissionHelper.checkAll(act)
        deviceList = DeviceList()
        deviceListAdapter = DeviceListAdapter(deviceList)
        deviceList.setOnChanged { notifyDeviceListChanged() }
        val nsdManager = requireContext().getSystemService(Context.NSD_SERVICE) as NsdManager
        discovery = DiscoveryManager(nsdManager, deviceList, act, messenger, ::setRefreshBar)
        discovery.restart(clear = true)
        super.onCreate(savedInstanceState)

        mainViewModel = activity?.run {
            ViewModelProviders.of(this)[MainViewModel::class.java]
        } ?: throw Exception("Invalid Activity")

        mainViewModel.title.value = title
    }

    override fun onResume() {
        discovery.restart(clear = false)
        super.onResume()
    }

    override fun onCreateOptionsMenu(menu: Menu, inflater: MenuInflater) {
        inflater.inflate(R.menu.devices, menu)
        super.onCreateOptionsMenu(menu, inflater)
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        when (item.itemId) {
            R.id.update_devices_location -> {
                Log.i(TAG, "updating devices location")
            }
            R.id.devices_troubleshooter -> {
                Log.i(TAG, "devices troubleshooter")
            }
        }
        return super.onOptionsItemSelected(item)
    }

    private fun notifyDeviceListChanged() {
        // notifyDataSetChanged has to be called on the UI thread.
        // notifyDataSetChanged is the most inefficient way of updating the RecyclerView but
        // given the small number of items and low update rate, it's probably fine for now.
        activity!!.runOnUiThread {
            val scanningLayout = view!!.findViewById<LinearLayout>(R.id.device_scanning_layout)
            val deviceLayout = view!!.findViewById<LinearLayout>(R.id.device_layout)
            if (deviceList.size() == 0) {
                deviceLayout.visibility = View.GONE
                scanningLayout.visibility = View.VISIBLE
            } else {
                scanningLayout.visibility = View.GONE
                deviceLayout.visibility = View.VISIBLE
            }
            deviceListAdapter.notifyDataSetChanged()
        }
    }

    private fun setRefreshBar(active: Boolean) {
        /*
        val progressBar = findViewById<ProgressBar>(R.id.progressBar)
        if (active) {
            progressBar.visibility = View.VISIBLE
        } else {
            progressBar.visibility = View.INVISIBLE
        }
        */
    }
}