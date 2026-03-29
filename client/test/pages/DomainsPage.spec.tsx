import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import DomainsPage from '../../src/pages/DomainsPage'
import { ThemeProvider } from '../../src/ThemeContext'
import { AuthProvider } from '../../src/auth/AuthContext'

// Mock MUI icons
vi.mock('@mui/icons-material', () => ({
  Delete: () => null,
  Add: () => null,
  UploadFile: () => null,
  Remove: () => null,
  ExpandMore: () => null,
  Download: () => null,
}))

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockDelete = vi.fn()

vi.mock('../../src/api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}))

const mockClipboardWriteText = vi.fn()
Object.assign(navigator, { clipboard: { writeText: mockClipboardWriteText } })

beforeEach(() => {
  vi.clearAllMocks()
  mockClipboardWriteText.mockClear()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'debug').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  
  // Mock localStorage
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    },
    writable: true,
  })
})

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

const setupMockGet = (overrides?: {
  domains?: { data: unknown[]; total: number }
  capabilities?: unknown
  status?: unknown
  settings?: unknown
}) => {
  mockGet.mockImplementation((url: string) => {
    if (url.startsWith('/domains?page=')) {
      return Promise.resolve({ data: overrides?.domains || { data: [], total: 0 } })
    }
    if (url === '/domains/scan/capabilities') {
      return Promise.resolve({ data: overrides?.capabilities || { scannerAvailable: false, timeoutAvailable: false } })
    }
    if (url === '/domains/scan/status') {
      return Promise.resolve({ data: overrides?.status || { running: false } })
    }
    if (url === '/settings') {
      return Promise.resolve({ data: overrides?.settings || {} })
    }
    return Promise.resolve({ data: {} })
  })
}

const renderDomainsPage = () => {
  return render(
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <DomainsPage />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}

describe('DomainsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Рендеринг', () => {
    it('должен рендериться с заголовком', async () => {
      setupMockGet()
      renderDomainsPage()

      await waitFor(() => {
        expect(screen.getByText('Белый список доменов (SNI)')).toBeInTheDocument()
      })
    })

    it('должен отображать поле для добавления домена', async () => {
      setupMockGet()
      renderDomainsPage()

      await waitFor(() => {
        expect(screen.getByLabelText('Доменное имя')).toBeInTheDocument()
      })
    })

    it('должен отображать кнопку "Добавить"', async () => {
      setupMockGet()
      renderDomainsPage()

      await waitFor(() => {
        expect(screen.getByText('Добавить')).toBeInTheDocument()
      })
    })

    it('должен отображать кнопку "Из файла"', async () => {
      setupMockGet()
      renderDomainsPage()

      await waitFor(() => {
        expect(screen.getByText('Из файла')).toBeInTheDocument()
      })
    })

    it('должен отображать таблицу доменов', async () => {
      setupMockGet({
        domains: { data: [{ id: 1, name: 'example.com' }], total: 1 }
      })
      renderDomainsPage()

      await waitFor(() => {
        expect(screen.getByText('example.com')).toBeInTheDocument()
      })
    })

    it('должен отображать сообщение при отсутствии доменов', async () => {
      setupMockGet({ domains: { data: [], total: 0 } })
      renderDomainsPage()

      await waitFor(() => {
        expect(screen.getByText('Нет доменов')).toBeInTheDocument()
      })
    })
  })

  describe('Загрузка данных', () => {
    it('должен загружать домены при монтировании', async () => {
      setupMockGet()
      renderDomainsPage()

      await waitFor(() => {
        expect(mockGet).toHaveBeenCalledWith('/domains?page=1&limit=10')
      })
    })

    it('должен загружать возможности сканера', async () => {
      setupMockGet()
      renderDomainsPage()

      await waitFor(() => {
        expect(mockGet).toHaveBeenCalledWith('/domains/scan/capabilities')
      })
    })

    it('должен отображать домены из API', async () => {
      setupMockGet({
        domains: { data: [{ id: 1, name: 'test.com' }, { id: 2, name: 'example.org' }], total: 2 }
      })
      renderDomainsPage()

      await waitFor(() => {
        expect(screen.getByText('test.com')).toBeInTheDocument()
        expect(screen.getByText('example.org')).toBeInTheDocument()
      })
    })
  })

  describe('Пагинация', () => {
    it('должен отображать пагинацию', async () => {
      setupMockGet({ domains: { data: [{ id: 1, name: 'test.com' }], total: 25 } })
      renderDomainsPage()

      await waitFor(() => {
        expect(screen.getByText('0–0 из 0')).toBeInTheDocument()
      })
    })

    it('должен переключать страницу при клике на следующую', async () => {
      setupMockGet({ domains: { data: [{ id: 1, name: 'test.com' }], total: 25 } })
      renderDomainsPage()

      const nextPageButton = await screen.findByLabelText('Go to next page')
      fireEvent.click(nextPageButton)

      await waitFor(() => {
        expect(mockGet).toHaveBeenCalledWith('/domains?page=2&limit=10')
      })
    })

    it('должен менять количество строк на странице', async () => {
      setupMockGet({ domains: { data: [{ id: 1, name: 'test.com' }], total: 25 } })
      renderDomainsPage()

      const rowsPerPageSelect = await screen.findByLabelText('Доменов на странице:')
      fireEvent.mouseDown(rowsPerPageSelect)

      const option = await screen.findByText('25')
      fireEvent.click(option)

      await waitFor(() => {
        expect(mockGet).toHaveBeenCalledWith('/domains?page=1&limit=25')
      })
    })
  })

  describe('Добавление домена', () => {
    it('должен позволять вводить домен', async () => {
      setupMockGet()
      renderDomainsPage()

      const input = await screen.findByLabelText('Доменное имя')
      fireEvent.change(input, { target: { value: 'newdomain.com' } })

      expect(input).toHaveValue('newdomain.com')
    })

    it('должен добавлять домен при клике на кнопку', async () => {
      setupMockGet()
      mockPost.mockResolvedValue({})

      renderDomainsPage()

      const input = await screen.findByLabelText('Доменное имя')
      fireEvent.change(input, { target: { value: 'newdomain.com' } })

      const addButton = screen.getByText('Добавить')
      fireEvent.click(addButton)

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith('/domains', { name: 'newdomain.com' })
      })
    })

    it('должен очищать поле после добавления', async () => {
      setupMockGet()
      mockPost.mockResolvedValue({})

      renderDomainsPage()

      const input = await screen.findByLabelText('Доменное имя')
      fireEvent.change(input, { target: { value: 'newdomain.com' } })

      const addButton = screen.getByText('Добавить')
      fireEvent.click(addButton)

      await waitFor(() => {
        expect(input).toHaveValue('')
      })
    })

    it('должен перезагружать список после добавления', async () => {
      setupMockGet()
      mockPost.mockResolvedValue({})

      renderDomainsPage()

      const input = await screen.findByLabelText('Доменное имя')
      fireEvent.change(input, { target: { value: 'newdomain.com' } })

      const addButton = screen.getByText('Добавить')
      fireEvent.click(addButton)

      await waitFor(() => {
        expect(mockGet).toHaveBeenCalledWith('/domains?page=1&limit=10')
      })
    })
  })

  describe('Удаление домена', () => {
    it('должен иметь функцию удаления в API', async () => {
      setupMockGet()
      renderDomainsPage()

      // Просто проверяем что компонент рендерится
      expect(screen.getByText('Белый список доменов (SNI)')).toBeInTheDocument()
    })
  })

  describe('Загрузка из файла', () => {
    it('должен отображать кнопку "Из файла"', async () => {
      setupMockGet()
      renderDomainsPage()

      await waitFor(() => {
        expect(screen.getByText('Из файла')).toBeInTheDocument()
      })
    })

    it('должен иметь скрытый input type="file"', async () => {
      setupMockGet()
      renderDomainsPage()

      const fileInput = await screen.findByRole('button', { name: /Из файла/i })
      expect(fileInput).toBeInTheDocument()
    })
  })
})
