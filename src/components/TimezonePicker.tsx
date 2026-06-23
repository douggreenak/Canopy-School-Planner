'use client';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface TimezoneOption {
  id: string;
  label: string;
  offset: string;
  region: string;
}

function buildTimezoneList(): TimezoneOption[] {
  const zones: TimezoneOption[] = [];
  const seen = new Set<string>();

  for (const tz of Intl.supportedValuesOf('timeZone')) {
    if (seen.has(tz)) continue;
    seen.add(tz);

    try {
      const now = new Date();
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        timeZoneName: 'shortOffset',
      });
      const parts = fmt.formatToParts(now);
      const offsetPart = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';

      const city = tz.split('/').pop()?.replace(/_/g, ' ') ?? tz;
      const region = tz.split('/')[0];

      zones.push({
        id: tz,
        label: city,
        offset: offsetPart,
        region,
      });
    } catch {
      // skip invalid
    }
  }

  zones.sort((a, b) => {
    const parseOff = (s: string) => {
      const m = s.match(/GMT([+-]?\d+)?(?::(\d+))?/);
      if (!m) return 0;
      const h = parseInt(m[1] || '0', 10);
      const min = parseInt(m[2] || '0', 10);
      return h * 60 + (h >= 0 ? min : -min);
    };
    return parseOff(a.offset) - parseOff(b.offset);
  });

  return zones;
}

let cachedZones: TimezoneOption[] | null = null;
function getTimezones(): TimezoneOption[] {
  if (!cachedZones) cachedZones = buildTimezoneList();
  return cachedZones;
}

interface Props {
  value: string;
  onChange: (tz: string) => void;
  label?: string;
  size?: 'small' | 'medium';
  helperText?: string;
}

export default function TimezonePicker({ value, onChange, label = 'Timezone', size = 'small', helperText }: Props) {
  const zones = getTimezones();
  const selected = zones.find((z) => z.id === value) ?? zones[0];

  return (
    <Autocomplete
      options={zones}
      value={selected}
      onChange={(_, newVal) => {
        if (newVal) onChange(newVal.id);
      }}
      getOptionLabel={(opt) => `${opt.label} (${opt.offset})`}
      groupBy={(opt) => opt.region}
      isOptionEqualToValue={(opt, val) => opt.id === val.id}
      filterOptions={(options, { inputValue }) => {
        const q = inputValue.toLowerCase();
        return options.filter(
          (o) =>
            o.label.toLowerCase().includes(q) ||
            o.id.toLowerCase().includes(q) ||
            o.offset.toLowerCase().includes(q),
        );
      }}
      renderOption={(props, option) => {
        const { key, ...rest } = props as React.HTMLAttributes<HTMLLIElement> & { key: string };
        return (
          <Box component="li" key={key} {...rest} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, width: '100%' }}>
            <Typography variant="body2">{option.label}</Typography>
            <Typography variant="caption" color="text.secondary">{option.offset}</Typography>
          </Box>
        );
      }}
      renderInput={(params) => (
        <TextField {...params} label={label} size={size} helperText={helperText} />
      )}
      size={size}
      disableClearable
    />
  );
}
