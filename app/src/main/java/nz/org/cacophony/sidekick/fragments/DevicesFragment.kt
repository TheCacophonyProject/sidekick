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

    private lateinit var recyclerView: androidx.recyclerview.widget.RecyclerView
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
            adapter = mainViewModel.deviceListAdapter.value
        }
        recyclerView.addItemDecoration(DividerItemDecoration(context, DividerItemDecoration.VERTICAL))
        setHasOptionsMenu(true)
        return root
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        Log.i(TAG, "$title on create")
        super.onCreate(savedInstanceState)

        mainViewModel = activity?.run {
            ViewModelProviders.of(this)[MainViewModel::class.java]
        } ?: throw Exception("Invalid Activity")

        mainViewModel.title.value = title

        mainViewModel.deviceList.value!!.setOnChanged { notifyDeviceListChanged() }
        mainViewModel.discovery.value!!.start()
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
            R.id.devices_refresh -> {
                thread {
                    mainViewModel.discovery.value!!.stop()
                    mainViewModel.discovery.value!!.clearDevices()
                    // Wait a second or the device can load quick enough so it doesn't
                    // look like anything changed in the UI
                    Thread.sleep(1000)
                    mainViewModel.discovery.value!!.start()
                }
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
            if (mainViewModel.deviceList.value!!.size() == 0) {
                deviceLayout.visibility = View.GONE
                scanningLayout.visibility = View.VISIBLE
            } else {
                scanningLayout.visibility = View.GONE
                deviceLayout.visibility = View.VISIBLE
            }
            mainViewModel.deviceListAdapter.value!!.notifyDataSetChanged()
        }
    }
}