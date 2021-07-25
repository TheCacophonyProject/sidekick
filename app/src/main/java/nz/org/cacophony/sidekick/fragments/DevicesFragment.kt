package nz.org.cacophony.sidekick.fragments

import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.view.*
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.lifecycle.ViewModelProvider
import androidx.recyclerview.widget.DividerItemDecoration
import nz.org.cacophony.sidekick.MainViewModel
import nz.org.cacophony.sidekick.R
import nz.org.cacophony.sidekick.TAG

class DevicesFragment : Fragment() {
    private val title = "Devices"

    private lateinit var recyclerView: androidx.recyclerview.widget.RecyclerView
    private lateinit var mainViewModel: MainViewModel
    private lateinit var networkWarningLayout: LinearLayout
    private lateinit var networkErrorLayout: LinearLayout
    private lateinit var scanningLayout: LinearLayout
    private lateinit var notScanningLayout: LinearLayout
    private lateinit var deviceLayout: LinearLayout
    private lateinit var locationLayout: LinearLayout
    private lateinit var locationStatus: TextView
    private lateinit var downloadButton: Button

    @SuppressLint("SetTextI18n")
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
            adapter = mainViewModel.deviceListAdapter.value
        }
        recyclerView.addItemDecoration(DividerItemDecoration(context, DividerItemDecoration.VERTICAL))
        setHasOptionsMenu(true)

        val validSSID = resources.getString(R.string.valid_ssid)
        root.findViewById<TextView>(R.id.network_error_message_text).text =
                "Not connected to a '$validSSID' network."
        root.findViewById<TextView>(R.id.network_warning_message_text).text =
                "Check that you are connected to a '$validSSID' network"
        networkErrorLayout = root.findViewById(R.id.network_error_message_layout)
        networkWarningLayout = root.findViewById(R.id.network_warning_message_layout)
        scanningLayout = root.findViewById(R.id.device_scanning_layout)
        notScanningLayout = root.findViewById(R.id.device_not_scanning_layout)
        deviceLayout = root.findViewById(R.id.device_layout)
        locationLayout = root.findViewById(R.id.location_layout)
        locationStatus = root.findViewById(R.id.location_status)
        locationLayout.visibility = View.VISIBLE
        downloadButton = root.findViewById(R.id.download_recordings_button)
        mainViewModel.groups.observe(viewLifecycleOwner, { mainViewModel.deviceList.value?.notifyChange() })
        notifyDeviceListChanged()
        return root
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        Log.i(TAG, "$title on create")
        super.onCreate(savedInstanceState)

        mainViewModel = activity?.run {
            ViewModelProvider(this).get(MainViewModel::class.java)
        } ?: throw Exception("Invalid Activity")

        mainViewModel.title.value = title

        mainViewModel.deviceList.value!!.setOnChanged { notifyDeviceListChanged() }
        mainViewModel.discovery.value!!.start()

        val networkChangeReceiver = NetworkChangeReceiver(::networkUpdate)
        activity?.registerReceiver(networkChangeReceiver, mainViewModel.networkIntentFilter)

        setViewModelObservers()
    }

    private fun setViewModelObservers() {
        mainViewModel.locationStatusText.observe(this, { updateLocationView(it) })
        mainViewModel.downloading.observe(this, { updateDownloading(it) })
        mainViewModel.scanning.observe(this, { updateScanning(it) })
    }

    private fun updateLocationView(status: String) {
        locationStatus.text = status
        locationLayout.visibility = View.VISIBLE
        if (status == "") {
            locationLayout.visibility = View.GONE
        } else {
            locationLayout.visibility = View.VISIBLE
        }
    }

    @SuppressLint("SetTextI18n")
    private fun updateDownloading(downloading: Boolean) {
        if (downloading) {
            downloadButton.isClickable = false
            downloadButton.alpha = .5f
            downloadButton.text = "GETTING RECORDINGS"
        } else {
            downloadButton.isClickable = true
            downloadButton.alpha = 1f
            downloadButton.text = "GET RECORDINGS"
        }
    }

    class NetworkChangeReceiver(val networkUpdate: (() -> Unit)) : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            networkUpdate()
        }
    }

    private fun networkUpdate() {
        if (mainViewModel.wifiHelper.canAccessApConfig()) {
            if (mainViewModel.wifiHelper.isConnectedToValidNetwork()) {
                networkErrorLayout.visibility = View.GONE
            } else {
                networkErrorLayout.visibility = View.VISIBLE
            }
        } else if (mainViewModel.wifiHelper.canAccessWifiSsid()) {
            if (mainViewModel.wifiHelper.isApOn() || mainViewModel.wifiHelper.validWifi()) {
                networkWarningLayout.visibility = View.GONE
            } else {
                networkWarningLayout.visibility = View.VISIBLE
            }
        }
    }

    override fun onCreateOptionsMenu(menu: Menu, inflater: MenuInflater) {
        inflater.inflate(R.menu.devices, menu)
        super.onCreateOptionsMenu(menu, inflater)
    }

    private fun updateScanning(scanning: Boolean) {
        requireActivity().runOnUiThread {
            if (scanning) {
                notScanningLayout.visibility = View.GONE
                scanningLayout.visibility = View.VISIBLE
            } else {
                scanningLayout.visibility = View.GONE
                notScanningLayout.visibility = View.VISIBLE
            }
        }
    }

    private fun notifyDeviceListChanged() {
        // notifyDataSetChanged has to be called on the UI thread.
        // notifyDataSetChanged is the most inefficient way of updating the RecyclerView but
        // given the small number of items and low update rate, it's probably fine for now.
        activity?.runOnUiThread {
            mainViewModel.deviceListAdapter.value!!.notifyDataSetChanged()
        }
    }
}