package nz.org.cacophony.sidekick.ui.devices

import android.content.Context
import android.net.nsd.NsdManager
import android.os.Bundle
import android.util.Log
import android.view.*
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.lifecycle.Observer
import androidx.lifecycle.ViewModelProviders
import nz.org.cacophony.sidekick.*
import kotlin.concurrent.thread

class DevicesFragment : Fragment() {

    private lateinit var devicesViewModel: DevicesViewModel
    private lateinit var permissionHelper: PermissionHelper
    private lateinit var messenger: Messenger
    private lateinit var deviceList: DeviceList
    private lateinit var deviceListAdapter: DeviceListAdapter
    private lateinit var recyclerView: androidx.recyclerview.widget.RecyclerView
    private lateinit var discovery: DiscoveryManager
    private lateinit var recDao: RecordingDao

    override fun onCreateView(
            inflater: LayoutInflater,
            container: ViewGroup?,
            savedInstanceState: Bundle?
    ): View? {
        container?.removeAllViews()
        devicesViewModel = ViewModelProviders.of(this).get(DevicesViewModel::class.java)
        val root = inflater.inflate(R.layout.fragment_device, container, false)
        val textView: TextView = root.findViewById(R.id.text_devices)
        devicesViewModel.text.observe(this, Observer { textView.text = it })
        val recyclerLayoutManager = androidx.recyclerview.widget.LinearLayoutManager(requireContext())
        recyclerView = root.findViewById<androidx.recyclerview.widget.RecyclerView>(R.id.device_list2).apply {
            setHasFixedSize(true)
            layoutManager = recyclerLayoutManager
            adapter = deviceListAdapter
        }
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
        activity!!.runOnUiThread() {
            val placeholderText = activity!!.findViewById<TextView>(R.id.placeholder_text)
            if (deviceList.size() == 0) {
                placeholderText.visibility = View.VISIBLE
            } else {
                placeholderText.visibility = View.GONE
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